export type BookmarkKind = "decision" | "bug" | "rule" | "solution";

export type Bookmark = {
  blockId: string;
  kind: BookmarkKind;
  /** A short excerpt so the list reads without reopening the turn. */
  text: string;
  createdAt: number;
};

export const BOOKMARK_KINDS: BookmarkKind[] = [
  "decision",
  "bug",
  "rule",
  "solution",
];

export const BOOKMARK_KIND_LABEL: Record<BookmarkKind, string> = {
  decision: "Decision",
  bug: "Bug",
  rule: "Rule",
  solution: "Solution",
};

export const BOOKMARKS_CHANGE_EVENT = "monocode:bookmarks-change";

const KEY = "monocode.bookmarks";

let version = 0;

export function bookmarksVersion(): number {
  return version;
}

export function subscribeBookmarks(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(BOOKMARKS_CHANGE_EVENT, callback);
  return () => window.removeEventListener(BOOKMARKS_CHANGE_EVENT, callback);
}

type Store = Record<string, Bookmark[]>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const store: Store = {};
    for (const [sessionId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      store[sessionId] = value.filter(isBookmark);
    }
    return store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // private mode / quota
  }
  version += 1;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BOOKMARKS_CHANGE_EVENT));
  }
}

function isBookmark(value: unknown): value is Bookmark {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Bookmark>;
  return (
    typeof row.blockId === "string" &&
    row.blockId.length > 0 &&
    typeof row.kind === "string" &&
    (BOOKMARK_KINDS as string[]).includes(row.kind)
  );
}

export function bookmarksForSession(sessionId: string): Bookmark[] {
  return read()[sessionId] ?? [];
}

export function bookmarkForBlock(
  sessionId: string,
  blockId: string,
): Bookmark | undefined {
  return bookmarksForSession(sessionId).find(
    (bookmark) => bookmark.blockId === blockId,
  );
}

export function setBookmark(
  sessionId: string,
  bookmark: Bookmark,
): void {
  const store = read();
  const existing = store[sessionId] ?? [];
  const next = existing.filter((row) => row.blockId !== bookmark.blockId);
  next.push(bookmark);
  store[sessionId] = next;
  write(store);
}

export function removeBookmark(sessionId: string, blockId: string): void {
  const store = read();
  const existing = store[sessionId];
  if (!existing) return;
  const next = existing.filter((row) => row.blockId !== blockId);
  if (next.length === existing.length) return;
  if (next.length === 0) delete store[sessionId];
  else store[sessionId] = next;
  write(store);
}
