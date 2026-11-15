import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { buildSystemPrompt } from "./prompt.js";

export const MODEL = "claude-opus-5-5";
export const MAX_INPUT_CHARS = 100_000;

export const OrganizeInputSchema = z.object({
  title: z.string().max(500).default(""),
  html: z.string().min(1, "note is empty").max(MAX_INPUT_CHARS, "note is too long"),
});
export type OrganizeInput = z.infer<typeof OrganizeInputSchema>;

export const OrganizedNoteSchema = z.object({
  title: z.string(),
  html: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
});
export type OrganizedNote = z.infer<typeof OrganizedNoteSchema>;

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
        content: `<note_title>${input.title}</note_title>\n<note_html>\n${input.html}\n</note_html>`,
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
