import type { Note, Notebook } from "../types";
import { noteFileName } from "./markdown";

/**
 * What the backup knows about a file it created in Drive. Identity lives in
 * Drive's `appProperties`, so no mapping table is needed on our side.
 */
export interface RemoteFile {
  id: string;
  name: string;
  appProperties: {
    role: "root" | "notebook" | "note";
    notebookId?: string;
    noteId?: string;
    /** note.updatedAt (ms) of the copy in Drive */
    updatedAt?: string;
  };
}

export type FolderOp =
  | { kind: "createFolder"; notebookId: string; name: string }
  | { kind: "renameFolder"; fileId: string; name: string };

export type FileOp =
  | { kind: "createNote"; noteId: string }
  | { kind: "updateNote"; noteId: string; fileId: string; moveFromNotebookId?: string };

export interface BackupPlan {
  folders: FolderOp[];
  files: FileOp[];
  /** File/folder ids to move to Drive's trash (recoverable for 30 days). */
  trash: string[];
}

export function isPlanEmpty(p: BackupPlan) {
  return p.folders.length + p.files.length + p.trash.length === 0;
}

/** Minimal set of Drive changes that makes the backup folder match the notes. */
export function planBackup(notes: Note[], notebooks: Notebook[], remote: RemoteFile[]): BackupPlan {
  const plan: BackupPlan = { folders: [], files: [], trash: [] };

  const folderByNb = new Map<string, RemoteFile>();
  for (const f of remote.filter((r) => r.appProperties.role === "notebook")) {
    const nbId = f.appProperties.notebookId!;
    if (folderByNb.has(nbId)) plan.trash.push(f.id); // duplicate from an interrupted run
    else folderByNb.set(nbId, f);
  }

  const notebookIds = new Set(notebooks.map((nb) => nb.id));
  for (const nb of notebooks) {
    const folder = folderByNb.get(nb.id);
    if (!folder) plan.folders.push({ kind: "createFolder", notebookId: nb.id, name: nb.name });
    else if (folder.name !== nb.name) plan.folders.push({ kind: "renameFolder", fileId: folder.id, name: nb.name });
  }
  // Deleted notebook: trashing the folder trashes the notes inside it too.
  const goneNotebooks = new Set<string>();
  for (const [nbId, folder] of folderByNb) {
    if (!notebookIds.has(nbId)) { plan.trash.push(folder.id); goneNotebooks.add(nbId); }
  }

  const fileByNote = new Map<string, RemoteFile>();
  for (const f of remote.filter((r) => r.appProperties.role === "note")) {
    const noteId = f.appProperties.noteId!;
    if (fileByNote.has(noteId)) plan.trash.push(f.id);
    else fileByNote.set(noteId, f);
  }

  for (const note of notes) {
    const file = fileByNote.get(note.id);
    if (!file) { plan.files.push({ kind: "createNote", noteId: note.id }); continue; }
    const movedFrom = file.appProperties.notebookId !== note.notebookId ? file.appProperties.notebookId : undefined;
    const changed = file.appProperties.updatedAt !== String(note.updatedAt) || file.name !== noteFileName(note);
    if (changed || movedFrom) {
      plan.files.push({ kind: "updateNote", noteId: note.id, fileId: file.id, ...(movedFrom && { moveFromNotebookId: movedFrom }) });
    }
  }

  const noteIds = new Set(notes.map((n) => n.id));
  for (const [noteId, file] of fileByNote) {
    if (noteIds.has(noteId)) continue;
    // Already going to the trash with its folder.
    if (goneNotebooks.has(file.appProperties.notebookId ?? "")) continue;
    plan.trash.push(file.id);
  }
  return plan;
}
