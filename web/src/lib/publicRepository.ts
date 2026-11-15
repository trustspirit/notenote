import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import type { PublicNote, PublicNotebook } from "./types";

/** Read-only access for anonymous visitors of shared links. */
export const publicRepository = {
  async getNote(noteId: string): Promise<PublicNote | null> {
    const snap = await getDoc(doc(db, "publicNotes", noteId));
    return snap.exists() ? (snap.data() as PublicNote) : null;
  },

  async getNotebook(notebookId: string): Promise<PublicNotebook | null> {
    const snap = await getDoc(doc(db, "publicNotebooks", notebookId));
    return snap.exists() ? (snap.data() as PublicNotebook) : null;
  },

  async listNotebookNotes(notebookId: string): Promise<PublicNote[]> {
    const q = query(collection(db, "publicNotebooks", notebookId, "notes"), orderBy("updatedAt", "desc"));
    return (await getDocs(q)).docs.map((d) => d.data() as PublicNote);
  },

  async getNotebookNote(notebookId: string, noteId: string): Promise<PublicNote | null> {
    const snap = await getDoc(doc(db, "publicNotebooks", notebookId, "notes", noteId));
    return snap.exists() ? (snap.data() as PublicNote) : null;
  },
};

export const shareUrls = {
  note: (noteId: string) => `${location.origin}/share/note/${noteId}`,
  notebook: (notebookId: string) => `${location.origin}/share/notebook/${notebookId}`,
};
