import {
  DEFAULT_RUNTIME_MODE,
  HARNESSES,
  HARNESS_LABEL,
  RUNTIME_MODES,
  type Block,
  type HarnessId,
  type RuntimeMode,
  type Session,
  type ToolPreview,
} from "./session";
import { sanitizeSessionGoal } from "./goal";
import { sanitizeBlock, sanitizeLinkedWorkItem } from "../data/sessionStore";

/**
 * Portable session export. Markdown is for reading and sharing; the JSON
 * envelope round-trips through `parseImportedSession` to restore a session.
 */
export const SESSION_EXPORT_FORMAT = "monocode-session";
export const SESSION_EXPORT_VERSION = 1;

export type SessionExportFormat = "markdown" | "json";

export function sessionToMarkdown(session: Session): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${yaml(session.title)}`);
  lines.push(`harness: ${session.harness}`);
  lines.push(`model: ${yaml(session.model)}`);
  lines.push(`project: ${yaml(session.cwd)}`);
  if (session.branch) lines.push(`branch: ${yaml(session.branch)}`);
  if (session.linkedWorkItem) {
    lines.push(`linked: ${session.linkedWorkItem.url}`);
  }
  lines.push(`exported: ${new Date().toISOString()}`);
  lines.push("---", "");
  lines.push(`# ${session.title || "Session"}`, "");
  for (const block of session.blocks) {
    lines.push(...blockToMarkdown(block, session));
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function sessionToExportJson(session: Session): string {
  const blocks = session.blocks
    .map(sanitizeBlock)
    .filter((block): block is Block => block != null);
  const envelope = {
    format: SESSION_EXPORT_FORMAT,
    version: SESSION_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    session: {
      harness: session.harness,
      model: session.model,
      modelSettings: session.modelSettings ?? {},
      runtimeMode: session.runtimeMode,
      title: session.title,
      cwd: session.cwd,
      blocks,
      ...(session.branch ? { branch: session.branch } : {}),
      ...(session.linkedWorkItem
        ? { linkedWorkItem: session.linkedWorkItem }
        : {}),
      ...(session.goal ? { goal: session.goal } : {}),
    },
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * Restore a session from an export. The id is always freshly minted and the
 * provider conversation id is intentionally dropped so the imported transcript
 * starts a new agent conversation instead of resuming a foreign one.
 */
export function parseImportedSession(text: string): Session | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  if (!root || root.format !== SESSION_EXPORT_FORMAT) return null;
  const raw = asRecord(root.session);
  if (!raw) return null;
  const harness = raw.harness;
  if (typeof harness !== "string" || !isHarness(harness)) return null;
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  const cwd = typeof raw.cwd === "string" ? raw.cwd.trim() : "";
  if (!model || !cwd) return null;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks
        .map((block) => sanitizeBlock(block as Block))
        .filter((block): block is Block => block != null)
    : [];
  if (blocks.length === 0) return null;
  const linkedWorkItem = sanitizeLinkedWorkItem(raw.linkedWorkItem);
  const goal = sanitizeSessionGoal(raw.goal);
  return {
    id: crypto.randomUUID(),
    harness,
    model,
    modelSettings: stringRecord(raw.modelSettings),
    runtimeMode: isRuntimeMode(raw.runtimeMode)
      ? raw.runtimeMode
      : DEFAULT_RUNTIME_MODE,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : HARNESS_LABEL[harness],
    cwd,
    blocks,
    ...(typeof raw.branch === "string" && raw.branch
      ? { branch: raw.branch }
      : {}),
    ...(linkedWorkItem ? { linkedWorkItem } : {}),
    ...(goal ? { goal } : {}),
  };
}

export function suggestExportFilename(session: Session): string {
  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  return slugify(session.title) || slugify(session.harness) || "session";
}

function blockToMarkdown(block: Block, session: Session): string[] {
  switch (block.role) {
    case "user": {
      const out = ["## You", "", block.text.trim()];
      for (const attachment of block.attachments ?? []) {
        out.push(`- Attachment: ${attachment.name}`);
      }
      out.push("");
      return out;
    }
    case "assistant":
      return [`## ${HARNESS_LABEL[session.harness]}`, "", block.text.trim(), ""];
    case "reasoning":
      return [
        "<details>",
        "<summary>Reasoning</summary>",
        "",
        block.text.trim(),
        "",
        "</details>",
        "",
      ];
    case "tool": {
      const title = block.tool?.title ?? "Tool";
      const status = block.tool?.status ? ` (${block.tool.status})` : "";
      const body =
        block.tool?.detail?.trim() ||
        previewText(block.tool?.preview) ||
        block.text.trim();
      return [
        `### Tool · ${title}${status}`,
        "",
        ...(body ? [fence(body), ""] : []),
      ];
    }
    case "tasks": {
      const out = ["### Tasks", ""];
      for (const item of block.taskList?.items ?? []) {
        out.push(`- [${item.status === "completed" ? "x" : " "}] ${item.text}`);
      }
      out.push("");
      return out;
    }
    case "plan": {
      const status = block.plan?.status ?? "ready";
      const body = (
        block.plan?.approvedText ||
        block.plan?.originalText ||
        block.text
      ).trim();
      return [`### Plan (${status})`, "", body, ""];
    }
    case "approval":
      return [`> Approval: ${block.approval?.decided ?? "pending"}`, ""];
    case "handoff":
      return [
        `> Handoff: ${block.handoff?.from ?? "?"} → ${block.handoff?.to ?? "?"} (${block.handoff?.status ?? "?"})`,
        "",
      ];
    case "system":
      return [`> ${block.text.trim()}`, ""];
    default:
      return [block.text.trim(), ""];
  }
}

function previewText(preview: ToolPreview | undefined): string {
  if (!preview) return "";
  if (preview.output?.trim()) return preview.output.trim();
  if (preview.lines?.length) {
    return preview.lines.map((line) => line.text).join("\n");
  }
  if (preview.query?.trim()) return preview.query.trim();
  return "";
}

function fence(text: string): string {
  const ticks = text.includes("```") ? "````" : "```";
  return `${ticks}\n${text}\n${ticks}`;
}

function yaml(value: string): string {
  return JSON.stringify(value ?? "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function isHarness(value: string): value is HarnessId {
  return (HARNESSES as readonly string[]).includes(value);
}

function isRuntimeMode(value: unknown): value is RuntimeMode {
  return (
    typeof value === "string" &&
    (RUNTIME_MODES as readonly string[]).includes(value)
  );
}

function stringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}
