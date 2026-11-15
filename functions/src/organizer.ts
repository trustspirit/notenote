import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type {
  BetaContentBlock, BetaMessageParam, BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SUBMIT_TOOL_NAME, buildResearchSystemPrompt, buildSystemPrompt } from "./prompt.js";

export const MODEL = "claude-opus-5-5";
export const MAX_INPUT_CHARS = 100_000;

export const OrganizeInputSchema = z.object({
  title: z.string().max(500).default(""),
  html: z.string().min(1, "note is empty").max(MAX_INPUT_CHARS, "note is too long"),
  /** "자료 보완": let the model search the web to check facts and add sources. */
  research: z.boolean().default(false),
});
export type OrganizeInput = z.infer<typeof OrganizeInputSchema>;

export const OrganizedNoteSchema = z.object({
  title: z.string(),
  html: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
});
export type OrganizedNote = z.infer<typeof OrganizedNoteSchema>;

/** A page the model actually saw in search results (the only URLs it may link to). */
export interface Source { url: string; title: string }
export type ResearchedNote = OrganizedNote & { sources: Source[] };

export class OrganizeError extends Error {
  constructor(
    message: string,
    readonly code: "refused" | "truncated" | "invalid_output",
  ) {
    super(message);
  }
}

/** Normalize model tags: trim, strip '#', lowercase, dedupe, cap at 5. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, "").toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 5);
}

const noteMessage = (input: OrganizeInput) =>
  `<note_title>${input.title}</note_title>\n<note_html>\n${input.html}\n</note_html>`;

export async function organizeNote(
  client: Anthropic,
  input: OrganizeInput,
): Promise<OrganizedNote> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Organizing notes is routine editing work: low effort keeps latency/cost down.
    output_config: { effort: "low", format: betaZodOutputFormat(OrganizedNoteSchema) },
    // If the primary model declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: noteMessage(input),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new OrganizeError("The model declined to organize this note.", "refused");
  }
  if (response.stop_reason === "max_tokens") {
    throw new OrganizeError("The organized note was too long to finish.", "truncated");
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new OrganizeError("The model returned an unexpected format.", "invalid_output");
  }
  return { ...parsed, title: parsed.title.trim() || input.title, tags: normalizeTags(parsed.tags) };
}

// ---------------------------------------------------------------------------
// Research mode ("자료 보완")
// ---------------------------------------------------------------------------

/** Searches per call: caps cost ($10 per 1,000 searches plus the result tokens). */
export const MAX_SEARCHES = 5;
/** API round trips: pause_turn resumes plus one reminder to submit. */
const MAX_ROUNDS = 4;
const MAX_SOURCES = 20;

/**
 * Web search always returns citations, and citations can't be combined with
 * output_config.format. So the model hands in its result by calling this tool,
 * and the input is validated with Zod here instead.
 */
const SUBMIT_TOOL: BetaToolUnion = {
  name: SUBMIT_TOOL_NAME,
  description: "Submit the finished, organized note. Call exactly once, when research and editing are done.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Concise title, max 60 chars" },
      html: { type: "string", description: "The organized note body as an HTML fragment" },
      tags: { type: "array", items: { type: "string" }, description: "1-5 lowercase topic tags" },
      summary: { type: "string", description: "Up to 3 sentences: organized / corrected / added" },
    },
    required: ["title", "html", "tags", "summary"],
  },
};

const RESEARCH_TOOLS: BetaToolUnion[] = [
  {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: MAX_SEARCHES,
    user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
  },
  SUBMIT_TOOL,
];

/** Collects every page the model saw: search results and cited locations. */
export function collectSources(content: BetaContentBlock[], into: Map<string, string>) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (!into.has(r.url)) into.set(r.url, r.title);
    } else if (block.type === "text") {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location" && !into.has(c.url)) into.set(c.url, c.title ?? c.url);
      }
    }
  }
}

export async function researchNote(client: Anthropic, input: OrganizeInput): Promise<ResearchedNote> {
  const messages: BetaMessageParam[] = [{ role: "user", content: noteMessage(input) }];
  const seen = new Map<string, string>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Checking facts takes more care than reformatting: medium, not low.
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: RESEARCH_TOOLS,
      system: [{ type: "text", text: buildResearchSystemPrompt(), cache_control: { type: "ephemeral" } }],
      messages,
    });
    collectSources(response.content, seen);

    if (response.stop_reason === "refusal") {
      throw new OrganizeError("The model declined to organize this note.", "refused");
    }
    if (response.stop_reason === "max_tokens") {
      throw new OrganizeError("The organized note was too long to finish.", "truncated");
    }

    const submit = response.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_TOOL_NAME);
    if (submit?.type === "tool_use") {
      const parsed = OrganizedNoteSchema.safeParse(submit.input);
      if (!parsed.success) {
        throw new OrganizeError("The model returned an unexpected format.", "invalid_output");
      }
      const note = parsed.data;
      return {
        ...note,
        title: note.title.trim() || input.title,
        tags: normalizeTags(note.tags),
        sources: [...seen].slice(0, MAX_SOURCES).map(([url, title]) => ({ url, title })),
      };
    }

    messages.push({ role: "assistant", content: response.content });
    // pause_turn: the server-side search loop hit its limit; sending the turn back resumes it.
    if (response.stop_reason !== "pause_turn") {
      messages.push({ role: "user", content: `Call ${SUBMIT_TOOL_NAME} with the finished note now.` });
    }
  }
  throw new OrganizeError("The model did not finish the note.", "invalid_output");
}
