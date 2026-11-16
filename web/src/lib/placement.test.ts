import { describe, expect, it } from "vitest";
import { layoutFromTree, moveNoteInLayout, orderUpdates, reorderFolders, topOrder, ROOT, type Layout } from "./placement";
import type { NotebookTree } from "./folders";
import type { Folder, Note } from "./types";

const f = (id: string): Folder => ({ id, notebookId: "n", name: id, createdAt: 0 });
const n = (id: string): Note => ({ id, notebookId: "n", title: id, contentHtml: "", tags: [], isPublic: false, createdAt: 0, updatedAt: 0 });

const tree: NotebookTree = {
  folders: [{ folder: f("f1"), notes: [n("a"), n("b")] }, { folder: f("f2"), notes: [] }],
  loose: [n("c"), n("d")],
};
const layout: Layout = { folders: ["f1", "f2"], notes: { f1: ["a", "b"], f2: [], [ROOT]: ["c", "d"] } };

describe("layoutFromTree", () => {
  it("lists folder ids and the note ids of every container, loose notes under ROOT", () => {
    expect(layoutFromTree(tree)).toEqual(layout);
  });
});

describe("moveNoteInLayout", () => {
  it("reorders inside one container", () => {
    expect(moveNoteInLayout(layout, "b", "f1", 0).notes.f1).toEqual(["b", "a"]);
  });
  it("moves into another container at an index", () => {
    const out = moveNoteInLayout(layout, "a", ROOT, 1);
    expect(out.notes.f1).toEqual(["b"]);
    expect(out.notes[ROOT]).toEqual(["c", "a", "d"]);
  });
  it("moves into an empty folder and back out to the top level", () => {
    const into = moveNoteInLayout(layout, "c", "f2", 0);
    expect(into.notes.f2).toEqual(["c"]);
    expect(moveNoteInLayout(into, "c", ROOT, 5).notes[ROOT]).toEqual(["d", "c"]);
  });
  it("does not mutate its input", () => {
    moveNoteInLayout(layout, "a", ROOT, 0);
    expect(layout.notes.f1).toEqual(["a", "b"]);
  });
});

describe("reorderFolders", () => {
  it("moves a folder to a new index", () => {
    expect(reorderFolders(layout, "f2", 0).folders).toEqual(["f2", "f1"]);
  });
});

describe("orderUpdates", () => {
  it("writes only the moved item when both neighbours have an order", () => {
    expect(orderUpdates(["a", "x", "b"], { a: 1000, b: 2000 }, "x")).toEqual([{ id: "x", order: 1500 }]);
  });
  it("goes before the first and after the last neighbour", () => {
    expect(orderUpdates(["x", "a"], { a: 1000 }, "x")).toEqual([{ id: "x", order: 0 }]);
    expect(orderUpdates(["a", "x"], { a: 1000 }, "x")).toEqual([{ id: "x", order: 2000 }]);
  });
  it("renumbers the whole container when a neighbour has no order yet", () => {
    expect(orderUpdates(["a", "x", "b"], { b: 5 }, "x")).toEqual([
      { id: "a", order: 0 }, { id: "x", order: 1000 }, { id: "b", order: 2000 },
    ]);
  });
  it("renumbers when neighbours are too close to split", () => {
    expect(orderUpdates(["a", "x", "b"], { a: 1, b: 1.0000000001 }, "x")).toHaveLength(3);
  });
  it("gives a lone item an order", () => {
    expect(orderUpdates(["x"], {}, "x")).toEqual([{ id: "x", order: 0 }]);
  });
});

describe("topOrder", () => {
  it("is just before the smallest order, or undefined when nothing is ordered", () => {
    expect(topOrder([3000, undefined, 1000])).toBe(0);
    expect(topOrder([undefined])).toBeUndefined();
    expect(topOrder([])).toBeUndefined();
  });
});
