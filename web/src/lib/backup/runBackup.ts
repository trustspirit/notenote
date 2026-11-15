import type { Note, Notebook } from "../types";
import type { DriveClient } from "./driveClient";
import { noteFileName, noteToMarkdown } from "./markdown";
import { nameHash, planBackup } from "./plan";

export const ROOT_FOLDER_NAME = "Pensieve";
/** Parallel Drive writes. Small enough to stay clear of per-user rate limits. */
const CONCURRENCY = 4;

export interface BackupResult { rootFolderId: string; changed: number }

async function inPool<T>(items: T[], worker: (item: T) => Promise<unknown>) {
  let next = 0;
  const run = async () => { while (next < items.length) await worker(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

/**
 * Bring "My Drive/Pensieve/<notebook>/<note>.md" in line with the notes.
 * Idempotent: an interrupted run is finished (and its duplicates removed) by the next one.
 */
export async function runBackup(drive: DriveClient, notes: Note[], notebooks: Notebook[]): Promise<BackupResult> {
  const remote = await drive.listAppFiles();
  const plan = planBackup(notes, notebooks, remote);
  const rootFolderId = plan.rootId ?? (await drive.createFolder(ROOT_FOLDER_NAME, null, { role: "root" }));

  const folderOf = new Map<string, string>();
  for (const f of remote) {
    if (f.appProperties.role === "notebook" && f.parents?.[0] === rootFolderId) folderOf.set(f.appProperties.notebookId!, f.id);
  }
  // Folders first: note uploads below need their parent ids.
  await inPool(plan.folders, async (op) => {
    if (op.kind === "createFolder") {
      folderOf.set(op.notebookId, await drive.createFolder(op.name, rootFolderId, { role: "notebook", notebookId: op.notebookId }));
    } else {
      await drive.rename(op.fileId, op.name);
    }
  });

  const noteById = new Map(notes.map((n) => [n.id, n]));
  const nbName = new Map(notebooks.map((nb) => [nb.id, nb.name]));
  await inPool(plan.files, async (op) => {
    const note = noteById.get(op.noteId)!;
    const notebookName = nbName.get(note.notebookId) ?? "";
    await drive.uploadMarkdown({
      fileId: op.kind === "updateNote" ? op.fileId : undefined,
      name: noteFileName(note),
      content: noteToMarkdown(note, notebookName),
      props: {
        role: "note", noteId: note.id, notebookId: note.notebookId,
        updatedAt: String(note.updatedAt), notebookHash: nameHash(notebookName),
      },
      parent: folderOf.get(note.notebookId) ?? rootFolderId,
      previousParent: op.kind === "updateNote" ? op.fromFolderId : undefined,
    });
  });

  await inPool(plan.trash, (id) => drive.trash(id));

  return { rootFolderId, changed: plan.folders.length + plan.files.length + plan.trash.length + (plan.rootId ? 0 : 1) };
}
