import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookmarkForBlock,
  bookmarksForSession,
  removeBookmark,
  setBookmark,
} from "./bookmarks";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
});

describe("bookmarks", () => {
  it("adds, reads, and removes a bookmark per session", () => {
    setBookmark("s1", {
      blockId: "b1",
      kind: "decision",
      text: "use Redis",
      createdAt: 1,
    });
    setBookmark("s1", {
      blockId: "b2",
      kind: "bug",
      text: "401 loop",
      createdAt: 2,
    });
    expect(bookmarksForSession("s1")).toHaveLength(2);
    expect(bookmarkForBlock("s1", "b1")?.kind).toBe("decision");
    expect(bookmarksForSession("s2")).toEqual([]);

    removeBookmark("s1", "b1");
    expect(bookmarkForBlock("s1", "b1")).toBeUndefined();
    expect(bookmarksForSession("s1")).toHaveLength(1);
  });

  it("replaces the kind when the same block is re-marked", () => {
    setBookmark("s1", {
      blockId: "b1",
      kind: "decision",
      text: "x",
      createdAt: 1,
    });
    setBookmark("s1", {
      blockId: "b1",
      kind: "rule",
      text: "x",
      createdAt: 2,
    });
    expect(bookmarksForSession("s1")).toHaveLength(1);
    expect(bookmarkForBlock("s1", "b1")?.kind).toBe("rule");
  });
});
