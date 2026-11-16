import { describe, expect, it } from "vitest";
import { groupNotebookNotes, moveTargets, sortFolders } from "./folders";
import type { Folder, Note, Notebook } from "./types";

const nb = (id: string, name: string): Notebook => ({ id, name, isPublic: false, createdAt: 0 });
const folder = (id: string, notebookId: string, name: string, order?: number, createdAt = 0): Folder =>
  ({ id, notebookId, name, order, createdAt });
const note = (id: string, notebookId: string, folderId?: string | null, updatedAt = 0): Note => ({
  id, notebookId, folderId, title: id, contentHtml: "", tags: [], isPublic: false, createdAt: 0, updatedAt,
});

describe("sortFolders", () => {
  it("orders by order, then createdAt; folders without order go last", () => {
    const out = sortFolders([folder("c", "n", "C", undefined, 1), folder("b", "n", "B", 2), folder("a", "n", "A", 1)]);
    expect(out.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupNotebookNotes", () => {
  const folders = [folder("f1", "n1", "F1", 1), folder("f2", "n1", "F2", 2), folder("x", "n2", "X", 1)];
  const notes = [
    note("a", "n1", "f1", 5), note("b", "n1", null, 9), note("c", "n1", "f1", 7),
    note("d", "n1", "gone", 3), note("e", "n2", "x", 1),
  ];
  const g = groupNotebookNotes(notes, folders, "n1");

  it("lists only this notebook's folders, in order, each with its notes newest first", () => {
    expect(g.folders.map((f) => f.folder.id)).toEqual(["f1", "f2"]);
    expect(g.folders[0].notes.map((n) => n.id)).toEqual(["c", "a"]);
    expect(g.folders[1].notes).toEqual([]);
  });
  it("puts notes outside a folder — or in a folder that no longer exists — at the top level", () => {
    expect(g.loose.map((n) => n.id)).toEqual(["b", "d"]);
  });
  it("honours manual order before updatedAt", () => {
    const ordered = groupNotebookNotes([{ ...note("a", "n1", null, 1), order: 2 }, { ...note("b", "n1", null, 9), order: 1 }], [], "n1");
    expect(ordered.loose.map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("moveTargets", () => {
  const notebooks = [nb("n1", "업무"), nb("n2", "개인")];
  const folders = [folder("f1", "n1", "회의", 1), folder("f2", "n2", "책", 1)];
  const targets = moveTargets(notebooks, folders, note("a", "n1", "f1"));

  it("offers each notebook's top level followed by its folders", () => {
    expect(targets.map((t) => [t.notebookId, t.folderId, t.label])).toEqual([
      ["n1", null, "업무"], ["n1", "f1", "업무 › 회의"], ["n2", null, "개인"], ["n2", "f2", "개인 › 책"],
    ]);
  });
  it("marks where the note already is", () => {
    expect(targets.filter((t) => t.isCurrent).map((t) => t.folderId)).toEqual(["f1"]);
    expect(moveTargets(notebooks, folders, note("b", "n2")).find((t) => t.isCurrent)?.label).toBe("개인");
  });
});
