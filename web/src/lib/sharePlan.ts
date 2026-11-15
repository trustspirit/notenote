import type { Note } from "./types";

/**
 * Pure decision logic for keeping the public mirror in sync with a note.
 * Given the note before/after a change and which notebooks are public,
 * returns the mirror documents that must be written or deleted.
 */
export type ShareOp =
  | { kind: "upsertNote"; noteId: string }
  | { kind: "deleteNote"; noteId: string }
  | { kind: "upsertInNotebook"; notebookId: string; noteId: string }
  | { kind: "deleteInNotebook"; notebookId: string; noteId: string };

type NoteShareState = Pick<Note, "id" | "notebookId" | "isPublic">;

export function planShareOps(
  prev: NoteShareState | null,
  next: NoteShareState | null,
  isNotebookPublic: (notebookId: string) => boolean,
): ShareOp[] {
  const ops: ShareOp[] = [];
  const id = (next ?? prev)?.id;
  if (!id) return ops;

  // 1) Individually shared link: publicNotes/{id}
  if (next?.isPublic) ops.push({ kind: "upsertNote", noteId: id });
  else if (prev?.isPublic) ops.push({ kind: "deleteNote", noteId: id });

  // 2) Shared via notebook: publicNotebooks/{nb}/notes/{id}
  const nextNb = next && isNotebookPublic(next.notebookId) ? next.notebookId : null;
  const prevNb = prev && isNotebookPublic(prev.notebookId) ? prev.notebookId : null;
  if (prevNb && prevNb !== nextNb) ops.push({ kind: "deleteInNotebook", notebookId: prevNb, noteId: id });
  if (nextNb) ops.push({ kind: "upsertInNotebook", notebookId: nextNb, noteId: id });

  return ops;
}
