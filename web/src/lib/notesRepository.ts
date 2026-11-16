import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction, setDoc, updateDoc, writeBatch,
  type DocumentReference, type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { Folder, Note, Notebook } from "./types";

const BATCH_LIMIT = 450;
/** Fixed id so two tabs opened on first login create one default notebook, not two. */
const DEFAULT_NOTEBOOK_ID = "default";

const notebooksCol = (uid: string) => collection(db, "users", uid, "notebooks");
const notesCol = (uid: string) => collection(db, "users", uid, "notes");
const foldersCol = (uid: string) => collection(db, "users", uid, "folders");

/**
 * Private workspace of one signed-in user. Only private docs are written here:
 * the public read-only mirror is maintained by Cloud Functions from these docs
 * (functions/src/mirrorTriggers.ts), so sharing is just a flag on the note/notebook.
 */
export class NotesRepository {
  constructor(private readonly user: User) {}

  private get uid() { return this.user.uid; }

  // ---------- subscriptions ----------
  watchNotebooks(cb: (notebooks: Notebook[]) => void): Unsubscribe {
    return onSnapshot(query(notebooksCol(this.uid), orderBy("createdAt")), (snap) =>
      cb(snap.docs.map((d) => ({ isPublic: false, ...d.data(), id: d.id }) as unknown as Notebook)),
    );
  }

  watchNotes(cb: (notes: Note[]) => void): Unsubscribe {
    return onSnapshot(query(notesCol(this.uid), orderBy("updatedAt", "desc")), (snap) =>
      cb(snap.docs.map((d) => ({ tags: [], isPublic: false, ...d.data(), id: d.id }) as unknown as Note)),
    );
  }

  watchFolders(cb: (folders: Folder[]) => void): Unsubscribe {
    return onSnapshot(query(foldersCol(this.uid), orderBy("createdAt")), (snap) =>
      cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as unknown as Folder)),
    );
  }

  // ---------- notebooks ----------
  async createNotebook(name: string): Promise<string> {
    const ref = doc(notebooksCol(this.uid));
    await setDoc(ref, { name, isPublic: false, createdAt: Date.now() });
    return ref.id;
  }

  /** First login: create the default notebook once, even if several tabs race. */
  async ensureDefaultNotebook(name: string) {
    const ref = doc(notebooksCol(this.uid), DEFAULT_NOTEBOOK_ID);
    await runTransaction(db, async (tx) => {
      if (!(await tx.get(ref)).exists()) tx.set(ref, { name, isPublic: false, createdAt: Date.now() });
    });
  }

  async renameNotebook(notebook: Notebook, name: string) {
    await updateDoc(doc(notebooksCol(this.uid), notebook.id), { name });
  }

  async deleteNotebook(notebook: Notebook, notesInside: Note[], foldersInside: Folder[] = []) {
    const refs = [
      ...notesInside.map((n) => doc(notesCol(this.uid), n.id)),
      ...foldersInside.map((f) => doc(foldersCol(this.uid), f.id)),
    ];
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
      await batch.commit();
    }
    await deleteDoc(doc(notebooksCol(this.uid), notebook.id));
  }

  // ---------- folders ----------
  async createFolder(notebookId: string, name: string): Promise<string> {
    const ref = doc(foldersCol(this.uid));
    await setDoc(ref, { notebookId, name, createdAt: Date.now() });
    return ref.id;
  }

  async renameFolder(folder: Folder, name: string) {
    await updateDoc(doc(foldersCol(this.uid), folder.id), { name });
  }

  /** Deleting a folder never deletes notes: they move out to the notebook's top level. */
  async deleteFolder(folder: Folder, notesInside: Note[]) {
    for (let i = 0; i < Math.max(notesInside.length, 1); i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const n of notesInside.slice(i, i + BATCH_LIMIT)) batch.update(doc(notesCol(this.uid), n.id), { folderId: null });
      if (i + BATCH_LIMIT >= notesInside.length) batch.delete(doc(foldersCol(this.uid), folder.id));
      await batch.commit();
    }
  }

  /** Share / unshare a whole notebook ("project") as a read-only public list. */
  async setNotebookPublic(notebook: Notebook, isPublic: boolean) {
    await updateDoc(doc(notebooksCol(this.uid), notebook.id), { isPublic });
  }

  // ---------- notes ----------
  newNoteRef(): DocumentReference { return doc(notesCol(this.uid)); }

  async saveNote(next: Note) {
    const { id, ...data } = next;
    await setDoc(doc(notesCol(this.uid), id), data);
  }

  /**
   * Change where a note lives without touching its content or updatedAt (so a move doesn't
   * reorder the "newest" list or race the editor's autosave).
   */
  async moveNote(note: Note, to: { notebookId: string; folderId: string | null; order?: number }) {
    await updateDoc(doc(notesCol(this.uid), note.id), {
      notebookId: to.notebookId, folderId: to.folderId, ...(to.order !== undefined && { order: to.order }),
    });
  }

  /** Apply the result of a drag and drop (new orders, maybe a new folder) in as few batches as possible. */
  async applyPlacement(ops: { kind: "note" | "folder"; id: string; patch: Record<string, unknown> }[]) {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + BATCH_LIMIT)) {
        batch.update(doc(op.kind === "note" ? notesCol(this.uid) : foldersCol(this.uid), op.id), op.patch);
      }
      await batch.commit();
    }
  }

  async deleteNote(note: Note) {
    await deleteDoc(doc(notesCol(this.uid), note.id));
  }
}
