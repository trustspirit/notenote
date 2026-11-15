import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/firestore";
import {
  readPrivateNote, removeFromIndex, shareId, sortIndex, toIndexEntry, toMirror, upsertIndex,
  type IndexEntry, type PrivateNote,
} from "./mirror.js";
import { planShareOps } from "./sharePlan.js";

/**
 * The public mirror is maintained only here, with admin rights: clients cannot
 * write publicNotes / publicNotebooks at all (see firestore.rules).
 *
 * Both handlers re-read the current private docs instead of trusting the event
 * payload. Trigger events can arrive out of order or more than once; deriving the
 * mirror from the current state makes every run idempotent and convergent.
 */

// Must match the Firestore database location.
const REGION = "asia-northeast3";

async function authorName(uid: string): Promise<string> {
  try {
    return (await getAuth().getUser(uid)).displayName ?? "익명";
  } catch {
    return "익명";
  }
}

const noteDoc = (db: Firestore, uid: string, id: string) => db.doc(`users/${uid}/notes/${id}`);
const notebookDoc = (db: Firestore, uid: string, id: string) => db.doc(`users/${uid}/notebooks/${id}`);
const publicNoteDoc = (db: Firestore, uid: string, id: string) => db.doc(`publicNotes/${shareId(uid, id)}`);
const publicNotebookDoc = (db: Firestore, uid: string, id: string) => db.doc(`publicNotebooks/${shareId(uid, id)}`);

export async function reconcileNote(db: Firestore, uid: string, noteId: string, before: PrivateNote | null) {
  const current = readPrivateNote(noteId, (await noteDoc(db, uid, noteId).get()).data());

  const nbIds = [...new Set([before?.notebookId, current?.notebookId].filter((x): x is string => !!x))];
  const nbPublic = new Map<string, boolean>();
  await Promise.all(nbIds.map(async (id) => {
    nbPublic.set(id, (await notebookDoc(db, uid, id).get()).data()?.isPublic === true);
  }));

  const ops = planShareOps(before, current, (id) => nbPublic.get(id) ?? false);
  if (ops.length === 0) return;
  const name = ops.some((op) => op.kind.startsWith("upsert")) ? await authorName(uid) : "";

  for (const op of ops) {
    switch (op.kind) {
      case "upsertNote":
        await publicNoteDoc(db, uid, noteId).set(toMirror(uid, name, current!));
        break;
      case "deleteNote":
        await publicNoteDoc(db, uid, noteId).delete();
        break;
      case "upsertInNotebook":
      case "deleteInNotebook": {
        const nbRef = publicNotebookDoc(db, uid, op.notebookId);
        const mirrorRef = nbRef.collection("notes").doc(noteId);
        await db.runTransaction(async (tx) => {
          const nb = await tx.get(nbRef);
          // No notebook mirror yet: the notebook trigger builds the whole thing.
          if (!nb.exists) {
            if (op.kind === "deleteInNotebook") tx.delete(mirrorRef);
            return;
          }
          const index = (nb.data()?.notes ?? []) as IndexEntry[];
          if (op.kind === "upsertInNotebook") {
            tx.set(mirrorRef, toMirror(uid, name, current!));
            tx.update(nbRef, { notes: upsertIndex(index, toIndexEntry(current!)), updatedAt: Date.now() });
          } else {
            tx.delete(mirrorRef);
            tx.update(nbRef, { notes: removeFromIndex(index, noteId), updatedAt: Date.now() });
          }
        });
        break;
      }
    }
  }
}

export async function reconcileNotebook(db: Firestore, uid: string, nbId: string) {
  const nb = (await notebookDoc(db, uid, nbId).get()).data();
  const nbRef = publicNotebookDoc(db, uid, nbId);
  if (nb?.isPublic !== true) {
    await db.recursiveDelete(nbRef); // the doc and every mirrored note under it
    return;
  }

  const snap = await db.collection(`users/${uid}/notes`).where("notebookId", "==", nbId).get();
  const notes = snap.docs.map((d) => readPrivateNote(d.id, d.data())!);
  const name = await authorName(uid);
  const keep = new Set(notes.map((n) => n.id));
  const existing = await nbRef.collection("notes").listDocuments();

  const writer = db.bulkWriter();
  void writer.set(nbRef, {
    id: nbId, ownerUid: uid, authorName: name, name: String(nb.name ?? ""),
    updatedAt: Date.now(), notes: sortIndex(notes.map(toIndexEntry)),
  });
  for (const n of notes) void writer.set(nbRef.collection("notes").doc(n.id), toMirror(uid, name, n));
  for (const d of existing) if (!keep.has(d.id)) void writer.delete(d);
  await writer.close();
}

export const syncNoteMirror = onDocumentWritten(
  { document: "users/{uid}/notes/{noteId}", region: REGION, retry: true },
  async (event) => {
    const { uid, noteId } = event.params;
    const before = readPrivateNote(noteId, event.data?.before.data());
    try {
      await reconcileNote(getFirestore(), uid, noteId, before);
    } catch (err) {
      logger.error("note mirror sync failed", { uid, noteId, err });
      throw err; // retried
    }
  },
);

export const syncNotebookMirror = onDocumentWritten(
  { document: "users/{uid}/notebooks/{nbId}", region: REGION, retry: true },
  async (event) => {
    const { uid, nbId } = event.params;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    // Strict: only a real boolean true publishes (same test as readPrivateNote for notes).
    const wasPublic = before?.isPublic === true;
    const isPublic = after?.isPublic === true;
    const db = getFirestore();
    try {
      // Fast path: renaming a public notebook only touches its title.
      if (wasPublic && isPublic && before?.name !== after?.name) {
        await publicNotebookDoc(db, uid, nbId).set({ name: String(after.name ?? ""), updatedAt: Date.now() }, { merge: true });
        return;
      }
      if (wasPublic === isPublic && before && after) return; // nothing public changed
      await reconcileNotebook(db, uid, nbId);
    } catch (err) {
      logger.error("notebook mirror sync failed", { uid, nbId, err });
      throw err;
    }
  },
);
