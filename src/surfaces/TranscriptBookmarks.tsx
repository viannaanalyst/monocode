import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Bookmark } from "../chrome/icons";
import {
  ExplorerMenu,
  type ExplorerMenuItem,
} from "../chrome/ExplorerMenu";
import {
  BOOKMARK_KINDS,
  BOOKMARK_KIND_LABEL,
  bookmarkForBlock,
  bookmarksForSession,
  bookmarksVersion,
  removeBookmark,
  setBookmark,
  subscribeBookmarks,
  type BookmarkKind,
} from "../lib/bookmarks";
import { t } from "../i18n";

const KIND_CLASS: Record<BookmarkKind, string> = {
  decision: "text-emerald-400",
  bug: "text-rose-400",
  rule: "text-amber-400",
  solution: "text-sky-400",
};

function useBookmarksVersion(): number {
  return useSyncExternalStore(
    subscribeBookmarks,
    bookmarksVersion,
    bookmarksVersion,
  );
}

export function BookmarkButton({
  sessionId,
  blockId,
  text,
}: {
  sessionId?: string;
  blockId: string;
  text: string;
}) {
  useBookmarksVersion();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const current = sessionId ? bookmarkForBlock(sessionId, blockId) : undefined;

  useEffect(() => {
    if (!sessionId) setMenu(null);
  }, [sessionId]);

  if (!sessionId) return null;

  const items: ExplorerMenuItem[] = [
    ...BOOKMARK_KINDS.map((kind) => ({
      kind: "item" as const,
      id: kind,
      label: t(BOOKMARK_KIND_LABEL[kind]),
    })),
    ...(current
      ? [
          { kind: "sep" as const },
          { kind: "item" as const, id: "remove", label: t("Remove bookmark") },
        ]
      : []),
  ];

  return (
    <>
      <button
        type="button"
        title={current ? t("Edit bookmark") : t("Bookmark")}
        aria-label={current ? t("Edit bookmark") : t("Bookmark")}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
        className={`rounded-md p-1 hover:bg-content/8 hover:text-content/70 ${
          current ? KIND_CLASS[current.kind] : "text-content/40"
        }`}
      >
        <Bookmark
          className="size-3.5"
          strokeWidth={1.75}
          fill={current ? "currentColor" : "none"}
        />
      </button>
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          items={items}
          ariaLabel={t("Bookmark")}
          onPick={(id) => {
            if (id === "remove") removeBookmark(sessionId, blockId);
            else {
              setBookmark(sessionId, {
                blockId,
                kind: id as BookmarkKind,
                text: text.replace(/\s+/g, " ").trim().slice(0, 160),
                createdAt: Date.now(),
              });
            }
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

export function BookmarksListButton({
  sessionId,
  onJump,
}: {
  sessionId?: string;
  onJump: (blockId: string) => void;
}) {
  useBookmarksVersion();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const rows = sessionId ? bookmarksForSession(sessionId) : [];

  const open = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ x: rect.right - 240, y: rect.bottom + 4 });
    },
    [],
  );

  if (!sessionId || rows.length === 0) return null;

  const items: ExplorerMenuItem[] = rows.map((row) => ({
    kind: "item" as const,
    id: row.blockId,
    label: `${t(BOOKMARK_KIND_LABEL[row.kind])} · ${row.text || t("Saved message")}`,
  }));

  return (
    <>
      <button
        type="button"
        title={t("Bookmarks")}
        aria-label={t("Bookmarks")}
        onClick={open}
        className="absolute left-3 top-2 z-30 inline-flex h-7 items-center gap-1 rounded-lg border border-content/12 bg-background-base/95 px-2 font-sans text-xs text-content/60 shadow-md backdrop-blur-xl hover:text-content"
        data-no-tooltip
      >
        <Bookmark className="size-3.5" strokeWidth={1.75} />
        <span className="tabular-nums">{rows.length}</span>
      </button>
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          width={240}
          items={items}
          ariaLabel={t("Bookmarks")}
          onPick={(id) => {
            onJump(id);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
