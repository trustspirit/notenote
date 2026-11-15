import { describe, expect, it } from "vitest";
import type { Note, Notebook } from "../types";
import { htmlToMarkdown, noteFileName, noteToMarkdown } from "./markdown";
import { isPlanEmpty, planBackup, type RemoteFile } from "./plan";

const nb = (id: string, name = id): Notebook => ({ id, name, isPublic: false, createdAt: 0 });
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, notebookId: "nb1", title: id, contentHtml: "<p>x</p>", tags: [], isPublic: false,
  createdAt: 0, updatedAt: 100, ...over,
});
const folder = (id: string, notebookId: string, name = notebookId): RemoteFile =>
  ({ id, name, appProperties: { role: "notebook", notebookId } });
const file = (id: string, n: Note, over: Partial<RemoteFile["appProperties"]> = {}): RemoteFile => ({
  id, name: noteFileName(n),
  appProperties: { role: "note", noteId: n.id, notebookId: n.notebookId, updatedAt: String(n.updatedAt), ...over },
});

describe("planBackup", () => {
  it("creates folders and files on first run", () => {
    const plan = planBackup([note("a")], [nb("nb1")], []);
    expect(plan.folders).toEqual([{ kind: "createFolder", notebookId: "nb1", name: "nb1" }]);
    expect(plan.files).toEqual([{ kind: "createNote", noteId: "a" }]);
  });

  it("does nothing when Drive is up to date", () => {
    const a = note("a");
    expect(isPlanEmpty(planBackup([a], [nb("nb1")], [folder("F1", "nb1"), file("D1", a)]))).toBe(true);
  });

  it("updates edited, renamed and moved notes", () => {
    const a = note("a"), b = note("b"), c = note("c");
    const remote = [
      folder("F1", "nb1"), folder("F2", "nb2"),
      file("Da", a, { updatedAt: "50" }),
      { ...file("Db", b), name: "old.md" },
      file("Dc", c, { notebookId: "nb2" }),
    ];
    const plan = planBackup([a, b, c], [nb("nb1"), nb("nb2")], remote);
    expect(plan.files).toEqual([
      { kind: "updateNote", noteId: "a", fileId: "Da" },
      { kind: "updateNote", noteId: "b", fileId: "Db" },
      { kind: "updateNote", noteId: "c", fileId: "Dc", moveFromNotebookId: "nb2" },
    ]);
  });

  it("renames folders and trashes deleted notes and notebooks", () => {
    const a = note("a"), gone = note("gone"), inGoneNb = note("x", { notebookId: "nb2" });
    const remote = [folder("F1", "nb1", "Old name"), folder("F2", "nb2"), file("Dg", gone), file("Dx", inGoneNb)];
    const plan = planBackup([a], [nb("nb1", "New name")], remote);
    expect(plan.folders).toEqual([{ kind: "renameFolder", fileId: "F1", name: "New name" }]);
    // Dx goes with its folder F2, so it is not trashed separately.
    expect(plan.trash.sort()).toEqual(["Dg", "F2"]);
  });

  it("cleans up duplicates left by an interrupted run", () => {
    const a = note("a");
    const plan = planBackup([a], [nb("nb1")], [folder("F1", "nb1"), folder("F1b", "nb1"), file("D1", a), file("D1b", a)]);
    expect(plan.trash.sort()).toEqual(["D1b", "F1b"]);
  });
});

describe("markdown", () => {
  it("converts rich text, task lists and highlights", () => {
    const html = '<h2>제목</h2><p><strong>굵게</strong> <mark>강조</mark></p>'
      + '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>완료</p></div></li>'
      + '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>할 일</p></div></li></ul>';
    expect(htmlToMarkdown(html)).toBe("## 제목\n\n**굵게** ==강조==\n\n- [x] 완료\n- [ ] 할 일");
  });

  it("writes TipTap lists as tight nested lists", () => {
    const html = "<ul><li><p>a</p><ul><li><p>a1</p></li></ul></li><li><p>b</p></li></ul><ol><li><p>one</p></li><li><p>two</p></li></ol>";
    expect(htmlToMarkdown(html)).toBe("- a\n  - a1\n- b\n\n1. one\n2. two");
  });

  it("writes YAML-safe front matter", () => {
    const md = noteToMarkdown(note("id1", { title: 'a "quoted": title', tags: ["x"], createdAt: 0, updatedAt: 0 }), "책");
    expect(md).toContain('title: "a \\"quoted\\": title"');
    expect(md).toContain('notebook: "책"');
    expect(md).toContain('tags: ["x"]');
    expect(md).toContain("pensieve_id: id1");
  });

  it("makes portable file names", () => {
    expect(noteFileName({ title: 'a/b:c*?"<>|' })).toBe("a b c.md");
    expect(noteFileName({ title: "   " })).toBe("제목 없음.md");
    expect(noteFileName({ title: "끝에 점..." })).toBe("끝에 점.md");
  });
});
