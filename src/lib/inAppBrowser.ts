import { invoke } from "@tauri-apps/api/core";
import { hostAllowed, normalizeBrowserUrl } from "./browserUrl";
import {
  BROWSER_PROBE_JS,
  BROWSER_SNAPSHOT_JS,
} from "./browserActions";
import type { BrowserCardMeta } from "./session";
import { loadBrowserAgentAllowlist } from "./settings";

export const BROWSER_REQUEST_FILE = ".monocode-browser.json";
export const BROWSER_RESULT_FILE = ".monocode-browser-result.json";

export const BROWSER_AGENT_OPS = [
  "navigate",
  "snapshot",
  "screenshot",
  "click",
  "dblclick",
  "hover",
  "type",
  "scroll",
  "console",
  "network",
] as const;

export type BrowserAgentOp = (typeof BROWSER_AGENT_OPS)[number];

export type BrowserAgentRequest = {
  id: string;
  op: BrowserAgentOp;
  url?: string;
  selector?: string;
  text?: string;
  dy?: number;
};

export type BrowserAgentResult = {
  id: string;
  ok: boolean;
  error?: string;
  url?: string;
  snapshot?: string;
  screenshot?: string;
  console?: unknown;
  network?: unknown;
};

type BrowserHandle = {
  id: string;
  label: string;
  url: () => string;
  navigate: (url: string) => Promise<void>;
  snapshot: () => Promise<string>;
  screenshot: () => Promise<string | null>;
  click: (selector: string, kind?: "click" | "dblclick" | "hover") => Promise<void>;
  type: (selector: string, text: string) => Promise<void>;
  scroll: (dy: number, selector?: string) => Promise<void>;
  console: () => Promise<unknown>;
  network: () => Promise<unknown>;
  probe: () => Promise<void>;
};

const handles = new Map<string, BrowserHandle>();
let activeId: string | null = null;
const listeners = new Set<() => void>();

export function registerBrowserHandle(handle: BrowserHandle) {
  handles.set(handle.id, handle);
  activeId = handle.id;
  notify();
  return () => {
    handles.delete(handle.id);
    if (activeId === handle.id) {
      const ids = [...handles.keys()];
      activeId = ids[ids.length - 1] ?? null;
    }
    notify();
  };
}

export function setActiveBrowserHandle(id: string) {
  if (!handles.has(id)) return;
  activeId = id;
  notify();
}

export function activeBrowserHandle(): BrowserHandle | null {
  if (activeId) return handles.get(activeId) ?? null;
  const all = [...handles.values()];
  return all[all.length - 1] ?? null;
}

export function hasBrowserPane(): boolean {
  return handles.size > 0;
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeBrowserHandles(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function normalizeBrowserOp(raw: string): BrowserAgentOp | null {
  const value = raw.trim().toLowerCase().replace(/^browser_/, "").replace(/-/g, "_");
  const mapped =
    value === "double_click" ||
    value === "doubleclick" ||
    value === "click_dblclick"
      ? "dblclick"
      : value === "take_screenshot"
        ? "screenshot"
        : value === "console_messages"
          ? "console"
          : value === "network_requests"
            ? "network"
            : value === "fill"
              ? "type"
              : value;
  return (BROWSER_AGENT_OPS as readonly string[]).includes(mapped)
    ? (mapped as BrowserAgentOp)
    : null;
}

export function parseBrowserAgentRequest(raw: string): BrowserAgentRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  const op = typeof rec.op === "string" ? normalizeBrowserOp(rec.op) : null;
  if (!id || !op) return null;
  const url = typeof rec.url === "string" ? rec.url : undefined;
  const selectorRaw =
    typeof rec.selector === "string"
      ? rec.selector
      : typeof rec.ref === "string"
        ? rec.ref
        : undefined;
  const selector = selectorRaw;
  const text =
    typeof rec.text === "string"
      ? rec.text
      : typeof rec.value === "string"
        ? rec.value
        : undefined;
  const dy = typeof rec.dy === "number" ? rec.dy : undefined;
  if (op === "navigate" && !normalizeBrowserUrl(url ?? "")) return null;
  if (
    (op === "click" || op === "dblclick" || op === "hover" || op === "type") &&
    !selector?.trim()
  ) {
    return null;
  }
  if (op === "type" && text == null) return null;
  return { id, op, url, selector, text, dy };
}

export function needsBrowserApproval(request: BrowserAgentRequest): boolean {
  if (
    request.op === "snapshot" ||
    request.op === "screenshot" ||
    request.op === "console" ||
    request.op === "network"
  ) {
    return false;
  }
  if (request.op === "navigate") {
    const url = normalizeBrowserUrl(request.url ?? "");
    return !url || !hostAllowed(url, loadBrowserAgentAllowlist());
  }
  const current = activeBrowserHandle()?.url() ?? "";
  return !hostAllowed(current, loadBrowserAgentAllowlist());
}

export async function runBrowserAgentRequest(
  request: BrowserAgentRequest,
  options?: { approved?: boolean },
): Promise<BrowserAgentResult> {
  const handle = activeBrowserHandle();
  if (!handle) {
    return {
      id: request.id,
      ok: false,
      error: "No in-app browser pane is open.",
    };
  }

  await handle.probe().catch(() => undefined);

  if (request.op === "navigate") {
    const url = normalizeBrowserUrl(request.url ?? "");
    if (!url) {
      return { id: request.id, ok: false, error: "Missing URL." };
    }
    if (!options?.approved && !hostAllowed(url, loadBrowserAgentAllowlist())) {
      return { id: request.id, ok: false, error: "Host is not on the allowlist." };
    }
    await handle.navigate(url);
    return { id: request.id, ok: true, url };
  }

  if (!options?.approved && needsBrowserApproval(request)) {
    return { id: request.id, ok: false, error: "Host is not on the allowlist." };
  }

  const url = handle.url();
  if (request.op === "snapshot") {
    return { id: request.id, ok: true, url, snapshot: await handle.snapshot() };
  }
  if (request.op === "screenshot") {
    const screenshot = await handle.screenshot();
    return { id: request.id, ok: Boolean(screenshot), url, screenshot: screenshot ?? undefined };
  }
  if (request.op === "console") {
    return { id: request.id, ok: true, url, console: await handle.console() };
  }
  if (request.op === "network") {
    return { id: request.id, ok: true, url, network: await handle.network() };
  }
  if (request.op === "type") {
    await handle.type(request.selector!.trim(), request.text ?? "");
    return { id: request.id, ok: true, url };
  }
  if (request.op === "scroll") {
    await handle.scroll(request.dy ?? 400, request.selector);
    return { id: request.id, ok: true, url };
  }
  await handle.click(
    request.selector!.trim(),
    request.op === "dblclick" || request.op === "hover" ? request.op : "click",
  );
  return { id: request.id, ok: true, url };
}

export function browserCardFromResult(
  request: BrowserAgentRequest,
  result: BrowserAgentResult,
): BrowserCardMeta {
  return {
    op: request.op,
    url: result.url ?? request.url,
    selector: request.selector,
    ok: result.ok,
    summary: result.error ?? request.text ?? request.selector,
    screenshot: result.screenshot,
  };
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function browserEval(label: string, script: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("browser_eval", { label, script });
}

export async function browserEvalJs(label: string, script: string): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("browser_eval_js", { label, script });
}

export async function browserNativeUrl(label: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("browser_url", { label });
  } catch {
    return null;
  }
}

export async function browserReloadNative(label: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("browser_reload", { label });
}


export async function browserScreenshotRect(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const png = await invoke<string>("browser_screenshot_rect", {
      x,
      y,
      width,
      height,
    });
    return png ? `data:image/png;base64,${png}` : null;
  } catch {
    return null;
  }
}

export async function readBrowserState(
  label: string,
): Promise<{ url: string; title: string } | null> {
  const url = await browserNativeUrl(label);
  return url ? { url, title: "" } : null;
}

export async function readBrowserSnapshot(label: string): Promise<string> {
  const raw = await browserEvalJs(label, BROWSER_SNAPSHOT_JS);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export async function injectBrowserProbe(label: string): Promise<void> {
  await browserEval(label, BROWSER_PROBE_JS).catch(() => undefined);
}

export async function evalJson(label: string, script: string): Promise<unknown> {
  const raw = await browserEvalJs(label, script);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

