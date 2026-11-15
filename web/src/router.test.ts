import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";

describe("matchRoute", () => {
  it("routes shared links", () => {
    expect(matchRoute("/share/note/abc")).toEqual({ name: "publicNote", noteId: "abc" });
    expect(matchRoute("/share/notebook/nb1")).toEqual({ name: "publicNotebook", notebookId: "nb1", noteId: undefined });
    expect(matchRoute("/share/notebook/nb1/n2")).toEqual({ name: "publicNotebook", notebookId: "nb1", noteId: "n2" });
  });
  it("falls back to the app", () => {
    expect(matchRoute("/")).toEqual({ name: "app" });
    expect(matchRoute("/share/note")).toEqual({ name: "app" });
  });
});
