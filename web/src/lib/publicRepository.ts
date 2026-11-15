import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { PublicNote, PublicNotebook } from "./types";

/** Read-only access for anonymous visitors of shared links. */
export const publicRepository = {
  // Ids below are share ids ("{uid}_{id}") taken from the URL.
  async getNote(noteId: string): Promise<PublicNote | null> {
    const snap = await getDoc(doc(db, "publicNotes", noteId));
    return snap.exists() ? (snap.data() as PublicNote) : null;
  },

  async getNotebook(notebookId: string): Promise<PublicNotebook | null> {
    const snap = await getDoc(doc(db, "publicNotebooks", notebookId));
    return snap.exists() ? (snap.data() as PublicNotebook) : null;
  },

  async getNotebookNote(notebookId: string, noteId: string): Promise<PublicNote | null> {
    const snap = await getDoc(doc(db, "publicNotebooks", notebookId, "notes", noteId));
    return snap.exists() ? (snap.data() as PublicNote) : null;
  },
};

/**
 * Public ids embed the owner ("{uid}_{id}") so security rules can tell who may
 * write behind a link without any lookups. Firestore auto ids never contain "_".
 */
export const shareId = (ownerUid: string, id: string) => `${ownerUid}_${id}`;

export const shareUrls = {
  note: (ownerUid: string, noteId: string) => `${location.origin}/share/note/${shareId(ownerUid, noteId)}`,
  notebook: (ownerUid: string, notebookId: string) => `${location.origin}/share/notebook/${shareId(ownerUid, notebookId)}`,
};
