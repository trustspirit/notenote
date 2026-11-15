import {
  collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch,
  type DocumentReference, type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import { shareId } from "./publicRepository";
import { planShareOps, type ShareOp } from "./sharePlan";
import type { Note, Notebook, PublicNote, PublicNotebook } from "./types";

const BATCH_LIMIT = 450;

const notebooksCol = (uid: string) => collection(db, "users", uid, "notebooks");
const notesCol = (uid: string) => collection(db, "users", uid, "notes");

function toPublicNote(user: User, note: Note): PublicNote {
  return {
    id: note.id,
    ownerUid: user.uid,
    authorName: user.displayName ?? "익명",
    title: note.title,
    contentHtml: note.contentHtml,
    tags: note.tags,
    updatedAt: note.updatedAt,
    kind: note.kind ?? "text",
    ...(note.mindmap && { mindmap: note.mindmap }),
  };
}

/** Run writes in chunks under Firestore's 500-ops-per-batch limit. */
async function runInBatches(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
    await batch.commit();
  }
}

/**
 * Private workspace of one signed-in user, plus keeping the public
 * read-only mirror (publicNotes / publicNotebooks) in sync with it.
 */
export class NotesRepository {
  constructor(private readonly user: User) {}

  private get uid() { return this.user.uid; }

  // Public mirror locations, keyed by owner-prefixed share ids (see firestore.rules).
  private publicNoteRef(noteId: string) { return doc(db, "publicNotes", shareId(this.uid, noteId)); }
  private publicNotebookRef(nbId: string) { return doc(db, "publicNotebooks", shareId(this.uid, nbId)); }
  private publicNotebookNoteRef(nbId: string, noteId: string) {
    return doc(db, "publicNotebooks", shareId(this.uid, nbId), "notes", noteId);
  }

  /** Remove every mirrored note of a notebook, including ones missing from the local snapshot. */
  private async purgeNotebookMirror(nbId: string) {
    const snap = await getDocs(collection(db, "publicNotebooks", shareId(this.uid, nbId), "notes"));
    await runInBatches(snap.docs.map((d) => (b) => b.delete(d.ref)));
  }

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

  async renameNotebook(notebook: Notebook, name: string) {
    await updateDoc(doc(notebooksCol(this.uid), notebook.id), { name });
    if (notebook.isPublic) await updateDoc(this.publicNotebookRef(notebook.id), { name, updatedAt: Date.now() });
  }

  async deleteNotebook(notebook: Notebook, notesInside: Note[], isNotebookPublic: (id: string) => boolean) {
    for (const note of notesInside) await this.deleteNote(note, isNotebookPublic);
    if (notebook.isPublic) {
      await this.purgeNotebookMirror(notebook.id);
      await deleteDoc(this.publicNotebookRef(notebook.id));
    }
    await deleteDoc(doc(notebooksCol(this.uid), notebook.id));
  }

  /** Share / unshare a whole notebook ("project") as a read-only public list. */
  async setNotebookPublic(notebook: Notebook, isPublic: boolean, notesInside: Note[]) {
    if (isPublic) {
      // The notebook doc must exist first: the rules for its notes look up its ownerUid.
      const pub: PublicNotebook = {
        id: notebook.id, ownerUid: this.uid, authorName: this.user.displayName ?? "익명",
        name: notebook.name, updatedAt: Date.now(),
      };
      await setDoc(this.publicNotebookRef(notebook.id), pub);
      await runInBatches(notesInside.map((n) => (b) =>
        b.set(this.publicNotebookNoteRef(notebook.id, n.id), toPublicNote(this.user, n))));
    } else {
      await this.purgeNotebookMirror(notebook.id);
      await deleteDoc(this.publicNotebookRef(notebook.id));
    }
    await updateDoc(doc(notebooksCol(this.uid), notebook.id), { isPublic });
  }

  // ---------- notes ----------
  newNoteRef(): DocumentReference { return doc(notesCol(this.uid)); }

  async saveNote(prev: Note | null, next: Note, isNotebookPublic: (id: string) => boolean) {
    const { id, ...data } = next;
    await setDoc(doc(notesCol(this.uid), id), data);
    await this.applyShareOps(planShareOps(prev, next, isNotebookPublic), next);
  }

  async deleteNote(note: Note, isNotebookPublic: (id: string) => boolean) {
    await this.applyShareOps(planShareOps(note, null, isNotebookPublic), null);
    await deleteDoc(doc(notesCol(this.uid), note.id));
  }

  private async applyShareOps(ops: ShareOp[], note: Note | null) {
    if (ops.length === 0) return;
    const batch = writeBatch(db);
    for (const op of ops) {
      switch (op.kind) {
        case "upsertNote":
          batch.set(this.publicNoteRef(op.noteId), toPublicNote(this.user, note!));
          break;
        case "deleteNote":
          batch.delete(this.publicNoteRef(op.noteId));
          break;
        case "upsertInNotebook":
          batch.set(this.publicNotebookNoteRef(op.notebookId, op.noteId), toPublicNote(this.user, note!));
          break;
        case "deleteInNotebook":
          batch.delete(this.publicNotebookNoteRef(op.notebookId, op.noteId));
          break;
      }
    }
    await batch.commit();
  }
}
