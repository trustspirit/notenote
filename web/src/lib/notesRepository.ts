import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction, setDoc, updateDoc, writeBatch,
  type DocumentReference, type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { Note, Notebook } from "./types";

const BATCH_LIMIT = 450;
/** Fixed id so two tabs opened on first login create one default notebook, not two. */
const DEFAULT_NOTEBOOK_ID = "default";

const notebooksCol = (uid: string) => collection(db, "users", uid, "notebooks");
const notesCol = (uid: string) => collection(db, "users", uid, "notes");

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

  async deleteNotebook(notebook: Notebook, notesInside: Note[]) {
    for (let i = 0; i < notesInside.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const n of notesInside.slice(i, i + BATCH_LIMIT)) batch.delete(doc(notesCol(this.uid), n.id));
      await batch.commit();
    }
    await deleteDoc(doc(notebooksCol(this.uid), notebook.id));
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

  async deleteNote(note: Note) {
    await deleteDoc(doc(notesCol(this.uid), note.id));
  }
}
