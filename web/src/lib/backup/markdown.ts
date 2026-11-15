import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { Note } from "../types";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndown.use(gfm);

// Later rules win in turndown, so the task-item rule below overrides this one.
// TipTap wraps every list item in <p>, which turndown renders as loose lists
// ("-   item" + blank lines). Notes are written as tight lists, so emit them that way.
turndown.addRule("tightListItem", {
  filter: "li",
  replacement: (content, node) => {
    const li = node as HTMLElement;
    const parent = li.parentNode as HTMLElement;
    const index = Array.prototype.indexOf.call(parent.children, li);
    const start = Number(parent.getAttribute("start") ?? 1);
    const marker = parent.nodeName === "OL" ? `${start + index}. ` : "- ";
    // Tight only when the item is one paragraph plus nested lists. Anything richer
    // (several paragraphs, code blocks, quotes) keeps its blank lines verbatim.
    const kids = Array.from(li.children);
    const tight = kids.filter((k) => k.nodeName === "P").length <= 1
      && kids.every((k) => ["P", "UL", "OL"].includes(k.nodeName));
    let body = content.replace(/^\n+/, "").replace(/\s+$/, "");
    if (tight) body = body.replace(/\n{2,}/g, "\n");
    body = body.replace(/\n(?!\n)/g, `\n${" ".repeat(marker.length)}`);
    return `${marker}${body}${tight ? "\n" : "\n\n"}`;
  },
});
// TipTap task items: <li data-type="taskItem" data-checked="true"><label><input …></label><div>text</div></li>
// (gfm's rule only handles checkboxes that sit directly inside <li>).
turndown.addRule("tiptapTaskItem", {
  filter: (node) => node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    const body = content.trim().replace(/\n+/g, "\n  ");
    return `- [${checked ? "x" : " "}] ${body}\n`;
  },
});
turndown.addRule("tiptapTaskLabel", {
  filter: (node) => node.nodeName === "LABEL" && node.parentElement?.getAttribute("data-type") === "taskItem",
  replacement: () => "",
});
turndown.addRule("highlight", { filter: ["mark"], replacement: (c) => `==${c}==` });

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}

/** JSON strings are valid YAML scalars, so this keeps front matter safe for any title. */
const yaml = (v: string) => JSON.stringify(v);

/** One note as a self-describing Markdown file (YAML front matter + body). */
export function noteToMarkdown(note: Note, notebookName: string): string {
  const front = [
    "---",
    `title: ${yaml(note.title || "제목 없음")}`,
    `notebook: ${yaml(notebookName)}`,
    `tags: [${note.tags.map(yaml).join(", ")}]`,
    `type: ${note.kind ?? "text"}`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    `pensieve_id: ${note.id}`,
    "---",
  ].join("\n");
  const heading = note.kind === "mindmap" ? "" : `# ${note.title || "제목 없음"}\n\n`;
  return `${front}\n\n${heading}${htmlToMarkdown(note.contentHtml)}\n`;
}

/**
 * Drive allows almost any name, but keep names portable for people who sync
 * Drive to a PC (Windows forbids these characters). Cuts by code point so an
 * emoji is never split into a lone surrogate.
 */
export function safeName(raw: string, fallback: string, max = 80): string {
  const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const cut = Array.from(cleaned).slice(0, max).join("").replace(/[. ]+$/, "");
  return cut || fallback;
}

export function noteFileName(note: Pick<Note, "title">): string {
  return `${safeName(note.title, "제목 없음")}.md`;
}

export function folderName(notebookName: string): string {
  return safeName(notebookName, "노트북");
}
