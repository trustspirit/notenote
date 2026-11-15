/**
 * Pure helpers for the read-only public mirror. The trigger code in
 * mirrorTriggers.ts does the I/O; everything here is plain data in, data out.
 */

/** The fields of a private note (users/{uid}/notes/{id}) the mirror cares about. */
export interface PrivateNote {
  id: string;
  notebookId: string;
  title: string;
  contentHtml: string;
  tags: string[];
  isPublic: boolean;
  updatedAt: number;
  kind?: "text" | "mindmap";
  mindmap?: unknown[];
}

export interface NoteMirror {
  id: string;
  ownerUid: string;
  authorName: string;
  title: string;
  contentHtml: string;
  tags: string[];
  updatedAt: number;
  kind: "text" | "mindmap";
  mindmap?: unknown[];
}

/** One row of a public notebook's note list, kept on the notebook doc itself. */
export interface IndexEntry {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  updatedAt: number;
  kind: "text" | "mindmap";
}

/** Keeps the notebook doc well under Firestore's 1 MiB document limit. */
export const INDEX_LIMIT = 1000;
const EXCERPT_LENGTH = 180;

/** Public ids embed the owner, "{uid}_{id}" (see firestore.rules). */
export const shareId = (uid: string, id: string) => `${uid}_${id}`;

/** Normalizes whatever is stored (older notes lack some fields). */
export function readPrivateNote(id: string, data: Record<string, unknown> | undefined): PrivateNote | null {
  if (!data) return null;
  return {
    id,
    notebookId: String(data.notebookId ?? ""),
    title: String(data.title ?? ""),
    contentHtml: String(data.contentHtml ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    isPublic: data.isPublic === true,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    kind: data.kind === "mindmap" ? "mindmap" : "text",
    ...(Array.isArray(data.mindmap) && { mindmap: data.mindmap }),
  };
}

export function toMirror(ownerUid: string, authorName: string, note: PrivateNote): NoteMirror {
  return {
    id: note.id,
    ownerUid,
    authorName,
    title: note.title,
    contentHtml: note.contentHtml,
    tags: note.tags,
    updatedAt: note.updatedAt,
    kind: note.kind ?? "text",
    ...(note.mindmap && { mindmap: note.mindmap }),
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/**
 * Plain text for previews. The result is rendered as text (never as HTML), so a
 * simple tag strip is enough here — no DOM on the server.
 */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|div|blockquote|pre)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();
}

export function toIndexEntry(note: PrivateNote): IndexEntry {
  const text = plainText(note.contentHtml);
  return {
    id: note.id,
    title: note.title,
    excerpt: text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text,
    tags: note.tags,
    updatedAt: note.updatedAt,
    kind: note.kind ?? "text",
  };
}

/** Newest first, capped. */
export function sortIndex(entries: IndexEntry[]): IndexEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, INDEX_LIMIT);
}

export function upsertIndex(index: IndexEntry[], entry: IndexEntry): IndexEntry[] {
  return sortIndex([...index.filter((e) => e.id !== entry.id), entry]);
}

export function removeFromIndex(index: IndexEntry[], noteId: string): IndexEntry[] {
  return index.filter((e) => e.id !== noteId);
}
