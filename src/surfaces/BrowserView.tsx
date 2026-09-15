import { Webview } from "@tauri-apps/api/webview";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ImagePlus,
  MoreHorizontal,
  RefreshCw,
} from "../chrome/icons";
import { copyText } from "../lib/clipboard";
import {
  requestAttachmentInChat,
  screenshotAttachment,
} from "../lib/attachments";
import { LAYER } from "../lib/layers";
import {
  overlayIntersects,
  registerNativeOverlay,
  subscribeNativeOverlays,
} from "../lib/nativeOverlay";
import { normalizeBrowserUrl, browserDataStoreId } from "../lib/browserUrl";
import {
  browserEval,
  browserEvalJs,
  browserReloadNative,
  browserScreenshotRect,
  evalJson,
  injectBrowserProbe,
  readBrowserSnapshot,
  readBrowserState,
  registerBrowserHandle,
  setActiveBrowserHandle,
} from "../lib/inAppBrowser";
import {
  BROWSER_CONSOLE_JS,
  BROWSER_NETWORK_JS,
  clickScript,
  scrollScript,
  typeScript,
} from "../lib/browserActions";
import { t } from "../i18n";

type Props = {
  id: string;
  url: string;
  cwd: string;
  active: boolean;
  onUrlChange?: (url: string, title?: string) => void;
};

type Nav = { stack: string[]; index: number };

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function webviewLabel(id: string): string {
  return `browser-${id.replace(/[^a-zA-Z0-9-/_:]/g, "")}`;
}

function syncNav(nav: Nav, url: string): Nav {
  if (nav.stack[nav.index] === url) return nav;
  if (nav.index > 0 && nav.stack[nav.index - 1] === url) {
    return { ...nav, index: nav.index - 1 };
  }
  if (
    nav.index >= 0 &&
    nav.index < nav.stack.length - 1 &&
    nav.stack[nav.index + 1] === url
  ) {
    return { ...nav, index: nav.index + 1 };
  }
  const stack = [...nav.stack.slice(0, nav.index + 1), url];
  return { stack, index: stack.length - 1 };
}

async function readPageTitle(label: string): Promise<string | null> {
  try {
    const raw = await browserEvalJs(label, "document.title");
    let title: unknown = raw;
    try {
      title = JSON.parse(raw);
    } catch {
      /* already a bare string */
    }
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

async function assertBrowserOk(label: string, script: string) {
  const parsed = (await evalJson(label, script)) as {
    ok?: boolean;
    error?: string;
  } | null;
  if (!parsed || parsed.ok !== true) {
    throw new Error(parsed?.error || "Browser action failed.");
  }
}

export function BrowserView({ id, url, cwd, active, onUrlChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const webview = useRef<Webview | null>(null);
  const attached = useRef(false);
  const currentRef = useRef(url);
  const onUrlChangeRef = useRef(onUrlChange);
  onUrlChangeRef.current = onUrlChange;
  const [draft, setDraft] = useState(url === "about:blank" ? "" : url);
  const [current, setCurrent] = useState(url);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [nav, setNav] = useState<Nav>({ stack: [], index: -1 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayCovered, setOverlayCovered] = useState(false);
  const menuBtn = useRef<HTMLDivElement>(null);
  currentRef.current = current;

  const label = webviewLabel(id);
  const showPage = current !== "about:blank";

  const commitUrl = (next: string, title?: string) => {
    const urlChanged = next !== currentRef.current;
    if (urlChanged) {
      setCurrent(next);
      currentRef.current = next;
      setDraft(next === "about:blank" ? "" : next);
      setNav((prev) => syncNav(prev, next));
    }
    if (urlChanged || title) {
      onUrlChangeRef.current?.(next, title);
    }
  };

  const navigateRef = useRef(async (raw: string) => {
    const next = normalizeBrowserUrl(raw);
    if (!next) return;
    commitUrl(next);
    if (attached.current) {
      await browserEval(label, `location.assign(${JSON.stringify(next)})`).catch(
        () => undefined,
      );
    }
  });
  navigateRef.current = async (raw: string) => {
    const next = normalizeBrowserUrl(raw);
    if (!next) return;
    commitUrl(next);
    if (attached.current) {
      await browserEval(label, `location.assign(${JSON.stringify(next)})`).catch(
        () => undefined,
      );
    }
  };

  useLayoutEffect(() => {
    if (!active || !isTauri() || !showPage || overlayCovered) {
      void webview.current?.hide().catch(() => undefined);
      return;
    }

    let cancelled = false;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    let lastBox = { left: 0, top: 0, width: 0, height: 0 };
    let syncing = false;

    const syncBounds = async (view: Webview) => {
      if (cancelled || syncing) return;
      const box = host.current?.getBoundingClientRect();
      if (!box || box.width < 2 || box.height < 2) {
        await view.hide().catch(() => undefined);
        return;
      }
      const next = {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
      if (
        next.left === lastBox.left &&
        next.top === lastBox.top &&
        next.width === lastBox.width &&
        next.height === lastBox.height
      ) {
        return;
      }
      lastBox = next;
      syncing = true;
      try {
        await view.setPosition(new LogicalPosition(next.left, next.top));
        await view.setSize(new LogicalSize(next.width, next.height));
        await view.show();
      } catch {
        /* webview closed */
      } finally {
        syncing = false;
      }
    };

    const scheduleSync = () => {
      if (syncTimer != null) return;
      syncTimer = setTimeout(() => {
        syncTimer = null;
        const view = webview.current;
        if (view) void syncBounds(view);
      }, 32);
    };

    const attach = async () => {
      setError(null);
      try {
        if (webview.current && attached.current) {
          await syncBounds(webview.current);
          return;
        }
        const existing = webview.current;
        if (existing) {
          await existing.close().catch(() => undefined);
          webview.current = null;
          attached.current = false;
        }
        const base = {
          url: currentRef.current,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          focus: false,
          transparent: false,
        };
        const waitReady = (view: Webview) =>
          new Promise<void>((resolve, reject) => {
            const onCreated = () => resolve();
            const onError = (event: { payload: unknown }) => {
              reject(
                event.payload instanceof Error
                  ? event.payload
                  : new Error(String(event.payload)),
              );
            };
            void view.once("tauri://created", onCreated);
            void view.once("tauri://error", onError);
          });
        let view: Webview;
        try {
          view = new Webview(getCurrentWindow(), label, {
            ...base,
            dataStoreIdentifier: browserDataStoreId(cwd),
          });
          webview.current = view;
          await waitReady(view);
        } catch {
          await webview.current?.close().catch(() => undefined);
          webview.current = null;
          view = new Webview(getCurrentWindow(), label, base);
          webview.current = view;
          await waitReady(view);
        }
        if (cancelled) {
          await view.close().catch(() => undefined);
          return;
        }
        attached.current = true;
        setNav((prev) =>
          prev.stack.length === 0
            ? { stack: [currentRef.current], index: 0 }
            : prev,
        );
        await syncBounds(view);
        void injectBrowserProbe(label);
        void readPageTitle(label).then((title) => {
          if (title) commitUrl(currentRef.current, title);
        });
      } catch (cause) {
        attached.current = false;
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : t("Couldn’t open the browser pane."),
          );
        }
      }
    };

    void attach();

    window.addEventListener("resize", scheduleSync);
    const observer = new ResizeObserver(scheduleSync);
    if (host.current) observer.observe(host.current);

    return () => {
      cancelled = true;
      if (syncTimer != null) clearTimeout(syncTimer);
      window.removeEventListener("resize", scheduleSync);
      observer.disconnect();
    };
  }, [active, showPage, id, generation, label, cwd, overlayCovered]);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      const box = host.current?.getBoundingClientRect();
      setOverlayCovered(box ? overlayIntersects(box) : false);
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    const unsubscribe = subscribeNativeOverlays(schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!overlayCovered) return;
    void webview.current?.hide().catch(() => undefined);
  }, [overlayCovered]);

  useEffect(() => {
    return () => {
      const view = webview.current;
      webview.current = null;
      attached.current = false;
      if (view) void view.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!active || !showPage || !isTauri()) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (!attached.current || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const state = await readBrowserState(label);
        if (cancelled || !state?.url) return;
        const urlChanged = state.url !== currentRef.current;
        commitUrl(state.url);
        if (urlChanged) {
          void injectBrowserProbe(label);
          void readPageTitle(label).then((title) => {
            if (title) commitUrl(currentRef.current, title);
          });
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, showPage, generation, label]);

  useEffect(() => {
    return registerBrowserHandle({
      id,
      label,
      url: () => currentRef.current,
      navigate: (next) => navigateRef.current(next),
      snapshot: () => readBrowserSnapshot(label),
      screenshot: async () => {
        const box = host.current?.getBoundingClientRect();
        if (!box) return null;
        const win = getCurrentWindow();
        const pos = await win.innerPosition();
        const scale = await win.scaleFactor();
        return browserScreenshotRect(
          pos.x / scale + box.left,
          pos.y / scale + box.top,
          box.width,
          box.height,
        );
      },
      click: async (selector, kind = "click") => {
        await assertBrowserOk(label, clickScript(selector, kind));
      },
      type: async (selector, text) => {
        await assertBrowserOk(label, typeScript(selector, text));
      },
      scroll: async (dy, selector) => {
        await assertBrowserOk(label, scrollScript(dy, selector));
      },
      console: () => evalJson(label, BROWSER_CONSOLE_JS),
      network: () => evalJson(label, BROWSER_NETWORK_JS),
      probe: () => injectBrowserProbe(label),
    });
  }, [id, label]);

  useEffect(() => {
    if (active) setActiveBrowserHandle(id);
  }, [active, id]);

  useEffect(() => {
    if (!active || url === currentRef.current || url === "about:blank") return;
    void navigateRef.current(url);
  }, [url, active]);

  const canBack = nav.index > 0;
  const canForward = nav.index >= 0 && nav.index < nav.stack.length - 1;

  const goDelta = async (delta: -1 | 1) => {
    const nextIndex = nav.index + delta;
    if (nextIndex < 0 || nextIndex >= nav.stack.length) return;
    await browserEval(
      label,
      delta < 0 ? "history.back()" : "history.forward()",
    ).catch(() => undefined);
  };

  const recreate = () => {
    attached.current = false;
    setGeneration((n) => n + 1);
  };

  const sendScreenshotToChat = async () => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;
    const win = getCurrentWindow();
    const pos = await win.innerPosition();
    const scale = await win.scaleFactor();
    const data = await browserScreenshotRect(
      pos.x / scale + box.left,
      pos.y / scale + box.top,
      box.width,
      box.height,
    ).catch(() => null);
    if (!data) return;
    requestAttachmentInChat(screenshotAttachment(data));
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-visible">
      <div className="relative z-20 flex shrink-0 items-center gap-0.5 border-b border-content/10 px-1.5 py-1">
        <ChromeButton
          title={t("Back")}
          disabled={!canBack}
          onClick={() => void goDelta(-1)}
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.75} />
        </ChromeButton>
        <ChromeButton
          title={t("Forward")}
          disabled={!canForward}
          onClick={() => void goDelta(1)}
        >
          <ChevronRight className="size-3.5" strokeWidth={1.75} />
        </ChromeButton>
        <ChromeButton
          title={t("Reload")}
          disabled={!showPage}
          onClick={() => {
            void browserReloadNative(label).catch(recreate);
          }}
        >
          <RefreshCw className="size-3.5" strokeWidth={1.75} />
        </ChromeButton>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            void navigateRef.current(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("Search or enter a URL")}
            spellCheck={false}
            className="h-6 w-full rounded-md bg-content/10 px-2 text-[12px] text-content outline-none placeholder:text-content/35"
          />
        </form>
        <ChromeButton
          title={t("Send screenshot to chat")}
          disabled={!showPage}
          onClick={() => void sendScreenshotToChat()}
        >
          <ImagePlus className="size-3.5" strokeWidth={1.75} />
        </ChromeButton>
        <ChromeButton
          title={t("Open in system browser")}
          disabled={!showPage}
          onClick={() => {
            if (showPage) void openUrl(current);
          }}
        >
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </ChromeButton>
        <div ref={menuBtn} className="relative">
          <ChromeButton
            title={t("Browser actions")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
          </ChromeButton>
          {menuOpen ? (
            <BrowserActionsMenu
              anchor={menuBtn.current}
              enabled={showPage}
              onCopy={() => {
                if (showPage) void copyText(current);
                setMenuOpen(false);
              }}
              onHardReload={() => {
                recreate();
                setMenuOpen(false);
              }}
              onClearCache={() => {
                void webview.current
                  ?.clearAllBrowsingData()
                  .catch(() => undefined)
                  .then(recreate);
                setMenuOpen(false);
              }}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </div>
      <div ref={host} className="relative min-h-0 flex-1 bg-content/4">
        {current === "about:blank" ? (
          <p className="grid h-full place-items-center px-6 text-center text-[12px] text-content/40">
            {t("Enter a URL to open a page in this pane.")}
          </p>
        ) : error ? (
          <p className="grid h-full place-items-center px-6 text-center text-[12px] text-red-400/80">
            {error}
          </p>
        ) : !isTauri() ? (
          <p className="grid h-full place-items-center px-6 text-center text-[12px] text-content/40">
            {t("The browser pane needs the MonoCode app.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ChromeButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={t(title)}
      aria-label={t(title)}
      data-tooltip-placement="top"
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 cursor-pointer place-items-center rounded-md text-content/70 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-30 [&_*]:pointer-events-none"
    >
      {children}
    </button>
  );
}

function BrowserActionsMenu({
  anchor,
  enabled,
  onCopy,
  onHardReload,
  onClearCache,
  onClose,
}: {
  anchor: HTMLElement | null;
  enabled: boolean;
  onCopy: () => void;
  onHardReload: () => void;
  onClearCache: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const box = anchor?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = menu?.width ?? 176;
    const height = menu?.height ?? 108;
    setPos({
      left: Math.max(8, box.right - width),
      top: Math.max(8, box.top - height - 6),
    });
  }, [anchor]);

  useEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    return registerNativeOverlay(element);
  }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        zIndex: LAYER.dialog,
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed min-w-44 overflow-hidden rounded-md border border-content/15 bg-background-base py-1 text-[12px] shadow-xl"
    >
      <MenuItem disabled={!enabled} onClick={onCopy}>
        <Copy className="mr-2 inline size-3.5" strokeWidth={1.75} />
        {t("Copy URL")}
      </MenuItem>
      <MenuItem disabled={!enabled} onClick={onHardReload}>
        {t("Hard reload")}
      </MenuItem>
      <MenuItem disabled={!enabled} onClick={onClearCache}>
        {t("Clear cache")}
      </MenuItem>
    </div>,
    document.body,
  );
}

function MenuItem({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-content hover:bg-content/8 disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}
