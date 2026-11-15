import { describe, expect, it } from "vitest";
import { INDEX_LIMIT, plainText, readPrivateNote, removeFromIndex, toIndexEntry, toMirror, upsertIndex } from "./mirror.js";

const raw = { notebookId: "nb", title: "제목", contentHtml: "<p>a &amp; b</p><ul><li><p>항목</p></li></ul>", tags: ["x"], isPublic: true, updatedAt: 5 };

describe("mirror helpers", () => {
  it("normalizes stored notes, including old ones without kind", () => {
    expect(readPrivateNote("n", raw)).toMatchObject({ id: "n", kind: "text", isPublic: true });
    expect(readPrivateNote("n", { title: 1 })).toMatchObject({ title: "1", tags: [], isPublic: false, updatedAt: 0 });
    expect(readPrivateNote("n", undefined)).toBeNull();
  });

  it("builds a mirror without undefined fields (admin SDK rejects them)", () => {
    const m = toMirror("u", "Alice", readPrivateNote("n", raw)!);
    expect(Object.values(m).includes(undefined)).toBe(false);
    expect(m).toMatchObject({ ownerUid: "u", authorName: "Alice", kind: "text" });
    expect("mindmap" in m).toBe(false);
  });

  it("extracts readable plain text for previews", () => {
    expect(plainText(raw.contentHtml)).toBe("a & b 항목");
    expect(toIndexEntry(readPrivateNote("n", { ...raw, contentHtml: `<p>${"가".repeat(300)}</p>` })!).excerpt).toHaveLength(181);
  });

  it("keeps the index newest-first, deduplicated and capped", () => {
    const e = (id: string, updatedAt: number) => ({ id, title: id, excerpt: "", tags: [], updatedAt, kind: "text" as const });
    let index = upsertIndex([], e("a", 1));
    index = upsertIndex(index, e("b", 2));
    index = upsertIndex(index, e("a", 3));
    expect(index.map((x) => x.id)).toEqual(["a", "b"]);
    expect(removeFromIndex(index, "a").map((x) => x.id)).toEqual(["b"]);
    const big = Array.from({ length: INDEX_LIMIT + 5 }, (_, i) => e(`n${i}`, i));
    expect(upsertIndex(big, e("new", 1e9))).toHaveLength(INDEX_LIMIT);
  });
});
