import type { Note, Notebook } from "../types";
import type { DriveClient } from "./driveClient";
import { noteFileName, noteToMarkdown } from "./markdown";
import { planBackup } from "./plan";

export const ROOT_FOLDER_NAME = "Pensieve";

export interface BackupResult { rootFolderId: string; changed: number }

/**
 * Bring "My Drive/Pensieve/<notebook>/<note>.md" in line with the notes.
 * Idempotent: an interrupted run is finished (and its duplicates removed) by the next one.
 */
export async function runBackup(drive: DriveClient, notes: Note[], notebooks: Notebook[]): Promise<BackupResult> {
  const remote = await drive.listAppFiles();
  const rootFolderId =
    remote.find((f) => f.appProperties.role === "root")?.id ??
    (await drive.createFolder(ROOT_FOLDER_NAME, null, { role: "root" }));

  const plan = planBackup(notes, notebooks, remote);

  const folderOf = new Map<string, string>();
  for (const f of remote) if (f.appProperties.role === "notebook") folderOf.set(f.appProperties.notebookId!, f.id);
  for (const op of plan.folders) {
    if (op.kind === "createFolder") {
      folderOf.set(op.notebookId, await drive.createFolder(op.name, rootFolderId, { role: "notebook", notebookId: op.notebookId }));
    } else {
      await drive.rename(op.fileId, op.name);
    }
  }

  const noteById = new Map(notes.map((n) => [n.id, n]));
  const nbName = new Map(notebooks.map((nb) => [nb.id, nb.name]));
  for (const op of plan.files) {
    const note = noteById.get(op.noteId)!;
    await drive.uploadMarkdown({
      fileId: op.kind === "updateNote" ? op.fileId : undefined,
      name: noteFileName(note),
      content: noteToMarkdown(note, nbName.get(note.notebookId) ?? ""),
      props: { role: "note", noteId: note.id, notebookId: note.notebookId, updatedAt: String(note.updatedAt) },
      parent: folderOf.get(note.notebookId) ?? rootFolderId,
      previousParent: op.kind === "updateNote" && op.moveFromNotebookId ? folderOf.get(op.moveFromNotebookId) : undefined,
    });
  }

  for (const id of plan.trash) await drive.trash(id);

  return { rootFolderId, changed: plan.folders.length + plan.files.length + plan.trash.length };
}
