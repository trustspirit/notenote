import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { OrganizeError, OrganizeInputSchema, normalizeTags, organizeNote } from "./organizer.js";
import { buildSystemPrompt } from "./prompt.js";

function fakeClient(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

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
});

describe("organizeNote", () => {
  const input = { title: "회의", html: "<p>rough notes</p>" };

  it("returns parsed output with normalized tags and stable system prompt", async () => {
    const { client, parse } = fakeClient({
      stop_reason: "end_turn",
      parsed_output: { title: "  ", html: "<h2>정리</h2>", tags: ["#Meeting"], summary: "s" },
    });
    const result = await organizeNote(client, input);
    expect(result).toEqual({ title: "회의", html: "<h2>정리</h2>", tags: ["meeting"], summary: "s" });
    expect(parse.mock.calls[0][0].system[0].text).toBe(buildSystemPrompt());
  });

  it.each([
    ["refusal", "refused"],
    ["max_tokens", "truncated"],
  ])("maps stop_reason %s to %s", async (stop_reason, code) => {
    const { client } = fakeClient({ stop_reason, parsed_output: null });
    await expect(organizeNote(client, input)).rejects.toMatchObject({ code });
  });

  it("throws invalid_output when parsing failed", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", parsed_output: null });
    await expect(organizeNote(client, input)).rejects.toBeInstanceOf(OrganizeError);
  });
});
