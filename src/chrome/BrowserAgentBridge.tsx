import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deletePath, readTextFile, writeTextFile } from "../lib/fs";
import { joinPath } from "../lib/paths";
import {
  BROWSER_REQUEST_FILE,
  BROWSER_RESULT_FILE,
  browserCardFromResult,
  hasBrowserPane,
  needsBrowserApproval,
  parseBrowserAgentRequest,
  runBrowserAgentRequest,
  type BrowserAgentRequest,
} from "../lib/inAppBrowser";
import type { BrowserCardMeta } from "../lib/session";
import { ensureBrowserMcpScript } from "../lib/browserMcp";
import { loadBrowserAgentEnabled } from "../lib/settings";
import { LAYER } from "../lib/layers";
import { t } from "../i18n";

type Props = {
  cwd: string;
  onEnsurePane: (url?: string) => void;
  onTool?: (card: BrowserCardMeta) => void;
};

export function BrowserAgentBridge({ cwd, onEnsurePane, onTool }: Props) {
  const [pending, setPending] = useState<BrowserAgentRequest | null>(null);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);

  useEffect(() => {
    if (!cwd) return;
    const requestPath = joinPath(cwd, BROWSER_REQUEST_FILE);
    const resultPath = joinPath(cwd, BROWSER_RESULT_FILE);
    let cancelled = false;

    void ensureBrowserMcpScript(cwd).catch(() => undefined);

    const finish = async (result: {
      id: string;
      ok: boolean;
      error?: string;
      url?: string;
      snapshot?: string;
      screenshot?: string;
      console?: unknown;
      network?: unknown;
    }) => {
      await writeTextFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    };

    const poll = async () => {
      if (cancelled || busy.current || pending) return;
      if (!loadBrowserAgentEnabled()) return;
      let raw: string;
      try {
        raw = await readTextFile(requestPath);
      } catch {
        return;
      }
      const request = parseBrowserAgentRequest(raw);
      if (!request || seen.current.has(request.id)) return;
      seen.current.add(request.id);
      await deletePath(requestPath).catch(() => undefined);
      if (request.op === "navigate" && !hasBrowserPane()) {
        onEnsurePane(request.url);
        for (let i = 0; i < 8 && !hasBrowserPane(); i += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 200));
          if (cancelled) return;
        }
      }
      if (needsBrowserApproval(request)) {
        setPending(request);
        return;
      }
      busy.current = true;
      try {
        const result = await runBrowserAgentRequest(request);
        await finish(result);
        onTool?.(browserCardFromResult(request, result));
      } catch (cause) {
        await finish({
          id: request.id,
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        busy.current = false;
      }
    };

    const timer = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cwd, onEnsurePane, onTool, pending]);

  const resolvePending = async (approved: boolean) => {
    const request = pending;
    setPending(null);
    if (!request) return;
    const resultPath = joinPath(cwd, BROWSER_RESULT_FILE);
    if (!approved) {
      const denied = { id: request.id, ok: false, error: "Denied." };
      await writeTextFile(resultPath, `${JSON.stringify(denied)}\n`);
      onTool?.(browserCardFromResult(request, denied));
      return;
    }
    try {
      const result = await runBrowserAgentRequest(request, { approved: true });
      await writeTextFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
      onTool?.(browserCardFromResult(request, result));
    } catch (cause) {
      await writeTextFile(
        resultPath,
        `${JSON.stringify({
          id: request.id,
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        })}\n`,
      );
    }
  };

  if (!pending) return null;

  const summary =
    pending.op === "navigate"
      ? t("Navigate to {url}", { url: pending.url ?? "" })
      : pending.op === "type"
        ? t("Type into {selector}", { selector: pending.selector ?? "" })
        : t("Click {selector}", { selector: pending.selector ?? pending.op });

  return createPortal(
    <div
      style={{ zIndex: LAYER.toast }}
      className="pointer-events-auto fixed right-3 top-3 w-[min(360px,calc(100vw-24px))] rounded-xl border border-content/20 bg-content/10 p-3 shadow-xl backdrop-blur-xl"
      role="alertdialog"
    >
      <p className="text-sm font-semibold text-content">
        {t("Browser tool needs approval")}
      </p>
      <p className="mt-1 text-sm text-content/70">{summary}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-sm font-medium text-content/70 hover:bg-content/10"
          onClick={() => void resolvePending(false)}
        >
          {t("Deny")}
        </button>
        <button
          type="button"
          className="rounded-md bg-content px-2.5 py-1 text-sm font-medium text-background-base"
          onClick={() => void resolvePending(true)}
        >
          {t("Allow")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
