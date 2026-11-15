import { describe, expect, it } from "vitest";
import { planShareOps } from "./sharePlan.js";

const pub = (ids: string[]) => (nb: string) => ids.includes(nb);
const note = (over: Partial<{ notebookId: string; isPublic: boolean }> = {}) => ({
  id: "n1", notebookId: "a", isPublic: false, ...over,
});

describe("planShareOps", () => {
  it("does nothing for a private note in a private notebook", () => {
    expect(planShareOps(note(), note(), pub([]))).toEqual([]);
  });

  it("publishes and unpublishes the single-note link", () => {
    expect(planShareOps(note(), note({ isPublic: true }), pub([]))).toEqual([
      { kind: "upsertNote", noteId: "n1" },
    ]);
    expect(planShareOps(note({ isPublic: true }), note(), pub([]))).toEqual([
      { kind: "deleteNote", noteId: "n1" },
    ]);
  });

  it("moves the mirror when a note moves between public notebooks", () => {
    expect(planShareOps(note({ notebookId: "a" }), note({ notebookId: "b" }), pub(["a", "b"]))).toEqual([
      { kind: "deleteInNotebook", notebookId: "a", noteId: "n1" },
      { kind: "upsertInNotebook", notebookId: "b", noteId: "n1" },
    ]);
  });

  it("removes the mirror when moved out of a public notebook", () => {
    expect(planShareOps(note({ notebookId: "a" }), note({ notebookId: "b" }), pub(["a"]))).toEqual([
      { kind: "deleteInNotebook", notebookId: "a", noteId: "n1" },
    ]);
  });

  it("removes every mirror when a note is deleted", () => {
    expect(planShareOps(note({ isPublic: true }), null, pub(["a"]))).toEqual([
      { kind: "deleteNote", noteId: "n1" },
      { kind: "deleteInNotebook", notebookId: "a", noteId: "n1" },
    ]);
  });
});
