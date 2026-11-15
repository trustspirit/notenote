/**
 * System prompt for the "AI 정리" (organize) action.
 *
 * Keep this string stable (no timestamps / per-request values) so the prefix
 * can be prompt-cached across requests.
 */

// The HTML tags the web editor (TipTap) can render. Anything else is dropped
// by the editor schema, so we tell the model to stay inside this set.
export const ALLOWED_TAGS = [
  "h1", "h2", "h3", "p", "strong", "em", "u", "s", "mark", "code", "pre",
  "blockquote", "ul", "ol", "li", "a", "hr", "br",
  // task lists: <ul data-type="taskList"><li data-type="taskItem" data-checked="false">
];

/**
 * How the note should be reshaped. This is the part that defines the
 * "personality" of the organizer — tweak these rules to match how you take notes.
 */
export const ORGANIZE_RULES: string[] = [
  "Preserve every fact, number, name, link and decision from the original. Never invent content.",
  "Write in the same language as the original note (Korean stays Korean).",
  "Fix typos and broken sentences, but keep the author's voice and terminology.",
  "Group related points under short h2/h3 headings; turn run-on paragraphs into bullet lists.",
  "Turn anything that reads like a to-do into a task list item (unchecked unless clearly done).",
  "Open with a 1-2 sentence summary paragraph; if there are action items, end with an '할 일' / 'Action items' section.",
];

export function buildSystemPrompt(): string {
  return [
    "You are an editor that turns rough notes into clean, well-structured notes.",
    "",
    "Rules:",
    ...ORGANIZE_RULES.map((rule, i) => `${i + 1}. ${rule}`),
    "",
    "Output format:",
    `- "html": the organized note body as an HTML fragment using only these tags: ${ALLOWED_TAGS.join(", ")}.`,
    '  For task lists use <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>…</p></li></ul>.',
    "  No <html>, <body>, <style>, <script>, inline styles or class attributes.",
    '- "title": a concise title (max 60 chars). Keep the original title if it is already good.',
    '- "tags": 1-5 short lowercase topic tags, no "#".',
    '- "summary": one sentence describing what changed.',
  ].join("\n");
}
