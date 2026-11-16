import type { Folder, Note, Notebook } from "./types";

/** Folders by manual order, then creation time; folders without an order go last. */
export function sortFolders(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) =>
    (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt - b.createdAt);
}

/** Manual order first; notes without one fall back to newest-updated first. */
function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) =>
    (a.order ?? Infinity) - (b.order ?? Infinity) || b.updatedAt - a.updatedAt);
}

export interface NotebookTree {
  folders: { folder: Folder; notes: Note[] }[];
  /** Notes outside any folder (including notes whose folder no longer exists). */
  loose: Note[];
}

/** What a notebook shows: its folders (each with its notes) and the notes outside folders. */
export function groupNotebookNotes(notes: Note[], folders: Folder[], notebookId: string): NotebookTree {
  const own = sortFolders(folders.filter((f) => f.notebookId === notebookId));
  const inNotebook = notes.filter((n) => n.notebookId === notebookId);
  const known = new Set(own.map((f) => f.id));
  return {
    folders: own.map((folder) => ({ folder, notes: sortNotes(inNotebook.filter((n) => n.folderId === folder.id)) })),
    loose: sortNotes(inNotebook.filter((n) => !n.folderId || !known.has(n.folderId))),
  };
}

export interface MoveTarget {
  notebookId: string;
  folderId: string | null;
  label: string;
  isCurrent: boolean;
}

/** Every place a note can be moved to: each notebook's top level, then its folders. */
export function moveTargets(notebooks: Notebook[], folders: Folder[], note: Note): MoveTarget[] {
  return notebooks.flatMap((nb) => {
    const own = sortFolders(folders.filter((f) => f.notebookId === nb.id));
    const known = new Set(own.map((f) => f.id));
    const at = (folderId: string | null) =>
      note.notebookId === nb.id && (folderId ? note.folderId === folderId : !note.folderId || !known.has(note.folderId));
    return [
      { notebookId: nb.id, folderId: null, label: nb.name, isCurrent: at(null) },
      ...own.map((f) => ({ notebookId: nb.id, folderId: f.id, label: `${nb.name} › ${f.name}`, isCurrent: at(f.id) })),
    ];
  });
}
