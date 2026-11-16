import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  MAX_SEARCHES, OrganizeError, OrganizeInputSchema, collectSources, normalizeTags, organizeNote,
} from "./organizer.js";
import { buildSystemPrompt } from "./prompt.js";

describe("normalizeTags", () => {
  it("trims, strips #, lowercases, dedupes and caps at 5", () => {
    expect(normalizeTags([" #Work", "work", "", "A", "b", "c", "d", "e"])).toEqual([
      "work", "a", "b", "c", "d",
    ]);
  });
});

describe("OrganizeInputSchema", () => {
  it("rejects empty notes", () => {
    expect(OrganizeInputSchema.safeParse({ html: "" }).success).toBe(false);
  });
  it("defaults title to empty string", () => {
    expect(OrganizeInputSchema.parse({ html: "<p>x</p>" }).title).toBe("");
  });
  it("ignores the retired research flag: every organize call does both jobs", () => {
    expect(OrganizeInputSchema.parse({ html: "<p>x</p>", research: false })).not.toHaveProperty("research");
  });
});

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();
  it("covers organizing and fact-checking in one prompt", () => {
    expect(prompt).toContain("Use web search to check them");
    expect(prompt).toContain("submit_organized_note");
  });
  it("tells the model how to express indentation with nested lists", () => {
    expect(prompt).toContain("<li><p>");
    expect(prompt).toMatch(/nested <ul>\/<ol>/);
  });
  it("tells the model to keep quotes verbatim in a blockquote with an attribution line", () => {
    expect(prompt).toContain("<blockquote>");
    expect(prompt).toMatch(/verbatim/i);
    expect(prompt).toContain("— ");
  });
  it("limits emphasis to <strong>, <em> and a sparing <mark>", () => {
    expect(prompt).toContain("<strong>");
    expect(prompt).toContain("<mark>");
    expect(prompt).toMatch(/sparingly/i);
  });
});

describe("organizeNote", () => {
  const input = { title: "연차대회", html: "<p>10월 연차대회 옥스 회장님 말씀 학습 권고</p>" };
  const note = { title: "연차 대회 말씀", html: "<p>정리됨</p>", tags: ["#Conference"], summary: "s" };
  const search = (results: { url: string; title: string }[] | object) => ({
    type: "web_search_tool_result", tool_use_id: "srv_1",
    content: Array.isArray(results)
      ? results.map((r) => ({ type: "web_search_result", encrypted_content: "x", page_age: null, ...r }))
      : results,
  });
  const submit = (inputObj: object = note) => ({ type: "tool_use", id: "tu_1", name: "submit_organized_note", input: inputObj });

  function scripted(...responses: object[]) {
    const create = vi.fn();
    for (const r of responses) create.mockResolvedValueOnce(r);
    return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
  }

  it("returns the submitted note with the sources the model actually saw", async () => {
    const { client, create } = scripted({
      stop_reason: "tool_use",
      content: [
        { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "oaks october conference" } },
        search([{ url: "https://example.org/talk", title: "The Talk" }]),
        { type: "text", text: "found", citations: [
          { type: "web_search_result_location", url: "https://example.org/other", title: null, cited_text: "c", encrypted_index: "i" },
        ] },
        submit(),
      ],
    });
    const result = await organizeNote(client, input);
    expect(result).toMatchObject({ title: "연차 대회 말씀", tags: ["conference"] });
    expect(result.sources).toEqual([
      { url: "https://example.org/talk", title: "The Talk" },
      { url: "https://example.org/other", title: "https://example.org/other" },
    ]);
    const req = create.mock.calls[0][0];
    expect(req.tools[0]).toMatchObject({ type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES });
    expect(req.output_config.format).toBeUndefined(); // citations + format would be a 400
    expect(req.system[0].text).toBe(buildSystemPrompt());
  });

  it("resumes a paused turn by sending it back unchanged", async () => {
    const paused = [{ type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "q" } }];
    const { client, create } = scripted(
      { stop_reason: "pause_turn", content: paused },
      { stop_reason: "tool_use", content: [submit()] },
    );
    await organizeNote(client, input);
    const second = create.mock.calls[1][0].messages;
    expect(second.at(-1)).toEqual({ role: "assistant", content: paused }); // no "continue" user message
  });

  it("reminds the model once if it stops without submitting", async () => {
    const { client, create } = scripted(
      { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
      { stop_reason: "tool_use", content: [submit()] },
    );
    await organizeNote(client, input);
    expect(create.mock.calls[1][0].messages.at(-1)).toMatchObject({ role: "user" });
  });

  it("gives up with invalid_output if it never submits", async () => {
    const turn = { stop_reason: "end_turn", content: [{ type: "text", text: "…" }] };
    const { client, create } = scripted(turn, turn, turn, turn, turn);
    await expect(organizeNote(client, input)).rejects.toMatchObject({ code: "invalid_output" });
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("doesn't let a later-round API error look refundable (searches were already billed)", async () => {
    const { client, create } = scripted({ stop_reason: "pause_turn", content: [] });
    create.mockRejectedValueOnce(new Anthropic.APIError(500, undefined, "boom", new Headers()));
    await expect(organizeNote(client, input)).rejects.toMatchObject({ code: "interrupted" });
  });

  it("passes a first-round API error through (nothing billed, quota is refunded)", async () => {
    const create = vi.fn().mockRejectedValue(new Anthropic.APIError(503, undefined, "down", new Headers()));
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    await expect(organizeNote(client, input)).rejects.toBeInstanceOf(Anthropic.APIError);
  });

  it("rejects a submission that doesn't match the schema", async () => {
    const { client } = scripted({ stop_reason: "tool_use", content: [submit({ title: "x" })] });
    await expect(organizeNote(client, input)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps refusal and ignores search errors when collecting sources", async () => {
    const { client } = scripted({ stop_reason: "refusal", content: [] });
    await expect(organizeNote(client, input)).rejects.toMatchObject({ code: "refused" });

    const seen = new Map<string, string>();
    collectSources([search({ type: "web_search_tool_result_error", error_code: "unavailable" })] as never, seen);
    expect(seen.size).toBe(0);
  });
});
