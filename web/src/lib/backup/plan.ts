import type { Note, Notebook } from "../types";
import { folderName, noteFileName } from "./markdown";

/**
 * What the backup knows about a file it created in Drive. Identity lives in
 * Drive's `appProperties`, so no mapping table is needed on our side.
 */
export interface RemoteFile {
  id: string;
  name: string;
  parents?: string[];
  /** RFC 3339; the oldest copy wins when duplicates exist. */
  createdTime?: string;
  appProperties: {
    role: "root" | "notebook" | "note";
    notebookId?: string;
    noteId?: string;
    /** note.updatedAt (ms) of the copy in Drive */
    updatedAt?: string;
    /** hash of the notebook name written into the file's front matter */
    notebookHash?: string;
  };
}

export type FolderOp =
  | { kind: "createFolder"; notebookId: string; name: string }
  | { kind: "renameFolder"; fileId: string; name: string };

export type FileOp =
  | { kind: "createNote"; noteId: string }
  | { kind: "updateNote"; noteId: string; fileId: string; fromFolderId?: string };

export interface BackupPlan {
  /** Existing root folder to use, or null to create one. */
  rootId: string | null;
  folders: FolderOp[];
  files: FileOp[];
  /** File/folder ids to move to Drive's trash (recoverable for 30 days). */
  trash: string[];
}

export function isPlanEmpty(p: BackupPlan) {
  return p.rootId !== null && p.folders.length + p.files.length + p.trash.length === 0;
}

/** Short stable hash (FNV-1a) — appProperties values are limited to ~124 bytes. */
export function nameHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const byAge = (a: RemoteFile, b: RemoteFile) =>
  (a.createdTime ?? "").localeCompare(b.createdTime ?? "") || a.id.localeCompare(b.id);
const parentOf = (f: RemoteFile) => f.parents?.[0];

/**
 * Minimal set of Drive changes that makes "Pensieve/<notebook>/<note>.md" match the notes.
 *
 * Only files inside the kept tree count as backed up: the oldest root, the oldest
 * folder per notebook inside it, the oldest file per note inside those. Everything
 * else (duplicates from concurrent or interrupted runs) is trashed, and notes that
 * only lived in a trashed duplicate are uploaded again.
 */
export function planBackup(notes: Note[], notebooks: Notebook[], remote: RemoteFile[]): BackupPlan {
  const plan: BackupPlan = { rootId: null, folders: [], files: [], trash: [] };
  const trashed = new Set<string>();
  const trash = (f: RemoteFile) => {
    // Trashing a folder trashes its contents, so skip anything already covered.
    const parent = parentOf(f);
    if (!(parent && trashed.has(parent))) plan.trash.push(f.id);
    trashed.add(f.id);
  };
  const ofRole = (role: RemoteFile["appProperties"]["role"]) =>
    remote.filter((f) => f.appProperties.role === role).sort(byAge);

  // 1. Root
  const [root, ...extraRoots] = ofRole("root");
  plan.rootId = root?.id ?? null;
  extraRoots.forEach(trash);

  // 2. Notebook folders inside the kept root
  const folderOfNb = new Map<string, RemoteFile>();
  for (const f of ofRole("notebook")) {
    const nbId = f.appProperties.notebookId!;
    if (root && parentOf(f) === root.id && !folderOfNb.has(nbId)) folderOfNb.set(nbId, f);
    else trash(f);
  }
  const nbIds = new Set(notebooks.map((nb) => nb.id));
  for (const [nbId, f] of folderOfNb) {
    if (!nbIds.has(nbId)) { trash(f); folderOfNb.delete(nbId); }
  }
  for (const nb of notebooks) {
    const f = folderOfNb.get(nb.id);
    const name = folderName(nb.name);
    if (!f) plan.folders.push({ kind: "createFolder", notebookId: nb.id, name });
    else if (f.name !== name) plan.folders.push({ kind: "renameFolder", fileId: f.id, name });
  }

  // 3. Note files inside kept notebook folders
  const nbOfFolder = new Map([...folderOfNb].map(([nbId, f]) => [f.id, nbId]));
  const fileOfNote = new Map<string, RemoteFile>();
  for (const f of ofRole("note")) {
    const noteId = f.appProperties.noteId!;
    if (nbOfFolder.has(parentOf(f) ?? "") && !fileOfNote.has(noteId)) fileOfNote.set(noteId, f);
    else trash(f);
  }

  const nbName = new Map(notebooks.map((nb) => [nb.id, nb.name]));
  const noteIds = new Set<string>();
  for (const note of notes) {
    noteIds.add(note.id);
    const f = fileOfNote.get(note.id);
    if (!f) { plan.files.push({ kind: "createNote", noteId: note.id }); continue; }
    const folderId = parentOf(f)!;
    const moved = nbOfFolder.get(folderId) !== note.notebookId;
    const stale =
      f.appProperties.updatedAt !== String(note.updatedAt) ||
      f.name !== noteFileName(note) ||
      f.appProperties.notebookHash !== nameHash(nbName.get(note.notebookId) ?? "");
    if (moved || stale) {
      plan.files.push({ kind: "updateNote", noteId: note.id, fileId: f.id, ...(moved && { fromFolderId: folderId }) });
    }
  }
  for (const [noteId, f] of fileOfNote) if (!noteIds.has(noteId)) trash(f);

  return plan;
}
