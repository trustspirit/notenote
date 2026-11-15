import { describe, expect, it } from "vitest";
import type { Note, Notebook } from "../types";
import { folderName, htmlToMarkdown, noteFileName, noteToMarkdown } from "./markdown";
import { isPlanEmpty, nameHash, planBackup, type RemoteFile } from "./plan";

const nb = (id: string, name = id): Notebook => ({ id, name, isPublic: false, createdAt: 0 });
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, notebookId: "nb1", title: id, contentHtml: "<p>x</p>", tags: [], isPublic: false,
  createdAt: 0, updatedAt: 100, ...over,
});
const root = (id = "R", createdTime = "2026-01-01"): RemoteFile =>
  ({ id, name: "Pensieve", createdTime, appProperties: { role: "root" } });
const folder = (id: string, notebookId: string, parent = "R", name = notebookId, createdTime = "2026-01-02"): RemoteFile =>
  ({ id, name, parents: [parent], createdTime, appProperties: { role: "notebook", notebookId } });
const file = (id: string, n: Note, parent: string, over: Partial<RemoteFile["appProperties"]> = {}, createdTime = "2026-01-03"): RemoteFile => ({
  id, name: noteFileName(n), parents: [parent], createdTime,
  appProperties: { role: "note", noteId: n.id, notebookId: n.notebookId, updatedAt: String(n.updatedAt), notebookHash: nameHash("nb1"), ...over },
});

describe("planBackup", () => {
  it("creates root, folders and files on first run", () => {
    const plan = planBackup([note("a")], [nb("nb1")], []);
    expect(plan.rootId).toBeNull();
    expect(plan.folders).toEqual([{ kind: "createFolder", notebookId: "nb1", name: "nb1" }]);
    expect(plan.files).toEqual([{ kind: "createNote", noteId: "a" }]);
  });

  it("does nothing when Drive is up to date", () => {
    const a = note("a");
    expect(isPlanEmpty(planBackup([a], [nb("nb1")], [root(), folder("F1", "nb1"), file("D1", a, "F1")]))).toBe(true);
  });

  it("updates edited, renamed and moved notes", () => {
    const a = note("a"), b = note("b"), c = note("c");
    const nb2Hash = { notebookHash: nameHash("nb1") };
    const remote = [
      root(), folder("F1", "nb1"), folder("F2", "nb2"),
      file("Da", a, "F1", { updatedAt: "50" }),
      { ...file("Db", b, "F1"), name: "old.md" },
      file("Dc", c, "F2", nb2Hash),
    ];
    const plan = planBackup([a, b, c], [nb("nb1"), nb("nb2")], remote);
    expect(plan.files).toEqual([
      { kind: "updateNote", noteId: "a", fileId: "Da" },
      { kind: "updateNote", noteId: "b", fileId: "Db" },
      { kind: "updateNote", noteId: "c", fileId: "Dc", fromFolderId: "F2" },
    ]);
  });

  it("rewrites notes when their notebook is renamed (front matter names it)", () => {
    const a = note("a");
    const plan = planBackup([a], [nb("nb1", "새 이름")], [root(), folder("F1", "nb1"), file("Da", a, "F1")]);
    expect(plan.folders).toEqual([{ kind: "renameFolder", fileId: "F1", name: "새 이름" }]);
    expect(plan.files).toEqual([{ kind: "updateNote", noteId: "a", fileId: "Da" }]);
  });

  it("trashes deleted notes and notebooks without double-trashing contents", () => {
    const a = note("a"), gone = note("gone"), inGoneNb = note("x", { notebookId: "nb2" });
    const remote = [root(), folder("F1", "nb1"), folder("F2", "nb2"), file("Da", a, "F1"), file("Dg", gone, "F1"), file("Dx", inGoneNb, "F2")];
    const plan = planBackup([a], [nb("nb1")], remote);
    expect(plan.trash.sort()).toEqual(["Dg", "F2"]);
  });

  it("re-uploads notes that only lived in a duplicate folder", () => {
    const a = note("a"), b = note("b");
    const remote = [
      root(), folder("F1", "nb1", "R", "nb1", "2026-01-02"), folder("F1b", "nb1", "R", "nb1", "2026-01-05"),
      file("Da", a, "F1"), file("Db", b, "F1b"),
    ];
    const plan = planBackup([a, b], [nb("nb1")], remote);
    expect(plan.trash).toEqual(["F1b"]);
    expect(plan.files).toEqual([{ kind: "createNote", noteId: "b" }]);
  });

  it("keeps the oldest root and rebuilds what was under the others", () => {
    const a = note("a");
    const remote = [
      root("R2", "2026-03-01"), root("R1", "2026-01-01"),
      folder("F2", "nb1", "R2"), file("Da2", a, "F2"),
    ];
    const plan = planBackup([a], [nb("nb1")], remote);
    expect(plan.rootId).toBe("R1");
    expect(plan.trash).toEqual(["R2"]);
    expect(plan.folders).toEqual([{ kind: "createFolder", notebookId: "nb1", name: "nb1" }]);
    expect(plan.files).toEqual([{ kind: "createNote", noteId: "a" }]);
  });

  it("keeps one copy of a note duplicated inside the same folder", () => {
    const a = note("a");
    const plan = planBackup([a], [nb("nb1")], [root(), folder("F1", "nb1"), file("D1", a, "F1"), file("D1b", a, "F1", {}, "2026-02-01")]);
    expect(plan.trash).toEqual(["D1b"]);
    expect(plan.files).toEqual([]);
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

  it("keeps blank lines of rich list items (paragraphs, code)", () => {
    const md = htmlToMarkdown("<ul><li><p>p1</p><p>p2</p></li><li><p>c</p><pre><code>x\n\ny</code></pre></li></ul>");
    expect(md).toContain("- p1\n\n  p2");
    expect(md).toContain("  x\n\n  y");
  });

  it("writes YAML-safe front matter", () => {
    const md = noteToMarkdown(note("id1", { title: 'a "quoted": title', tags: ["x"], createdAt: 0, updatedAt: 0 }), "책");
    expect(md).toContain('title: "a \\"quoted\\": title"');
    expect(md).toContain('notebook: "책"');
    expect(md).toContain('tags: ["x"]');
    expect(md).toContain("pensieve_id: id1");
  });

  it("makes portable file and folder names", () => {
    expect(noteFileName({ title: 'a/b:c*?"<>|' })).toBe("a b c.md");
    expect(noteFileName({ title: "   " })).toBe("제목 없음.md");
    expect(noteFileName({ title: "끝에 점..." })).toBe("끝에 점.md");
    expect(folderName("Q1: plans/ideas")).toBe("Q1 plans ideas");
  });

  it("never splits an emoji when shortening", () => {
    const name = noteFileName({ title: `${"가".repeat(79)}📌뒤` });
    expect(name).toBe(`${"가".repeat(79)}📌.md`);
    expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
  });
});
