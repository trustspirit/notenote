import type { User } from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotesRepository } from "../lib/notesRepository";
import type { Folder, Note, Notebook } from "../lib/types";

/** All notebooks + notes of the signed-in user, with live updates. */
export function useWorkspace(user: User) {
  const repo = useMemo(() => new NotesRepository(user), [user]);
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => repo.watchNotebooks(setNotebooks), [repo]);
  useEffect(() => repo.watchNotes(setNotes), [repo]);
  useEffect(() => repo.watchFolders(setFolders), [repo]);

  // First login: make sure there is at least one notebook to write into.
  useEffect(() => {
    if (notebooks && notebooks.length === 0 && !bootstrapped.current) {
      bootstrapped.current = true;
      void repo.ensureDefaultNotebook("내 노트북");
    }
  }, [notebooks, repo]);

  return {
    repo,
    notebooks: notebooks ?? [],
    notes: notes ?? [],
    folders: folders ?? [],
    loading: notebooks === null || notes === null || folders === null,
  };
}
