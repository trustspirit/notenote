import { describe, expect, it } from "vitest";
import type { Note, Notebook } from "../types";
import type { DriveClient } from "./driveClient";
import type { RemoteFile } from "./plan";
import { runBackup } from "./runBackup";

/** In-memory stand-in for DriveClient with the same observable behavior. */
class FakeDrive {
  files = new Map<string, RemoteFile & { parent: string | null; content?: string; trashed?: boolean }>();
  calls = 0;
  private seq = 0;
  private add(name: string, parent: string | null, props: Record<string, string>, content?: string) {
    const id = `f${this.seq++}`;
    this.files.set(id, { id, name, parent, content, appProperties: props as RemoteFile["appProperties"] });
    return id;
  }
  async listAppFiles() {
    return [...this.files.values()].filter((f) => !f.trashed && !this.inTrash(f.parent));
  }
  private inTrash(id: string | null): boolean {
    const f = id ? this.files.get(id) : undefined;
    return !!f && (!!f.trashed || this.inTrash(f.parent));
  }
  async createFolder(name: string, parent: string | null, props: Record<string, string>) { this.calls++; return this.add(name, parent, props); }
  async rename(id: string, name: string) { this.calls++; this.files.get(id)!.name = name; }
  async trash(id: string) { this.calls++; this.files.get(id)!.trashed = true; }
  async uploadMarkdown(o: { fileId?: string; name: string; content: string; props: Record<string, string>; parent: string }) {
    this.calls++;
    if (!o.fileId) return this.add(o.name, o.parent, o.props, o.content);
    Object.assign(this.files.get(o.fileId)!, { name: o.name, content: o.content, parent: o.parent, appProperties: o.props });
    return o.fileId;
  }
  live(role: string) { return [...this.files.values()].filter((f) => f.appProperties.role === role && !f.trashed && !this.inTrash(f.parent)); }
}

const nb = (id: string, name = id): Notebook => ({ id, name, isPublic: false, createdAt: 0 });
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, notebookId: "nb1", title: `제목 ${id}`, contentHtml: `<p>${id}</p>`, tags: [], isPublic: false,
  createdAt: 0, updatedAt: 1, ...over,
});

describe("runBackup", () => {
  it("mirrors notebooks as folders and notes as Markdown files", async () => {
    const drive = new FakeDrive();
    const res = await runBackup(drive as unknown as DriveClient, [note("a"), note("b", { notebookId: "nb2" })], [nb("nb1", "일기"), nb("nb2", "업무")]);
    const root = drive.live("root")[0];
    expect(res.rootFolderId).toBe(root.id);
    expect(drive.live("notebook").map((f) => f.name).sort()).toEqual(["업무", "일기"]);
    const a = drive.live("note").find((f) => f.appProperties.noteId === "a")!;
    expect(a.name).toBe("제목 a.md");
    expect(a.content).toContain("# 제목 a\n\na");
    expect(drive.files.get(a.parent!)!.name).toBe("일기");
  });

  it("second run with no changes makes no writes", async () => {
    const drive = new FakeDrive();
    const notes = [note("a")], nbs = [nb("nb1")];
    await runBackup(drive as unknown as DriveClient, notes, nbs);
    drive.calls = 0;
    const res = await runBackup(drive as unknown as DriveClient, notes, nbs);
    expect(res.changed).toBe(0);
    expect(drive.calls).toBe(0);
  });

  it("follows edits, moves and deletions", async () => {
    const drive = new FakeDrive();
    const d = drive as unknown as DriveClient;
    await runBackup(d, [note("a"), note("b")], [nb("nb1"), nb("nb2")]);
    await runBackup(d, [note("a", { title: "새 제목", updatedAt: 2, notebookId: "nb2" })], [nb("nb1"), nb("nb2")]);
    const files = drive.live("note");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("새 제목.md");
    expect(drive.files.get(files[0].parent!)!.appProperties.notebookId).toBe("nb2");
  });
});
