import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "./fs";
import type { SessionExportFormat } from "./sessionExport";

const RECENT_KEY = "monocode.sessionExports";
const RECENT_MAX = 20;

export type RecentSessionExport = {
  path: string;
  name: string;
  format: SessionExportFormat;
  at: number;
};

export function loadRecentSessionExports(): RecentSessionExport[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Partial<RecentSessionExport>;
      if (
        typeof row.path !== "string" ||
        typeof row.name !== "string" ||
        typeof row.at !== "number" ||
        (row.format !== "json" && row.format !== "markdown")
      ) {
        return [];
      }
      return [{ path: row.path, name: row.name, format: row.format, at: row.at }];
    });
  } catch {
    return [];
  }
}

function writeRecentSessionExports(entries: RecentSessionExport[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries));
  } catch {
    // private mode / quota
  }
}

function rememberSessionExport(entry: RecentSessionExport): void {
  const others = loadRecentSessionExports().filter(
    (existing) => existing.path !== entry.path,
  );
  writeRecentSessionExports([entry, ...others].slice(0, RECENT_MAX));
}

export function forgetSessionExport(path: string): void {
  writeRecentSessionExports(
    loadRecentSessionExports().filter((entry) => entry.path !== path),
  );
}

export async function saveSessionExport(
  defaultName: string,
  content: string,
  format: SessionExportFormat,
): Promise<string | null> {
  const extension = format === "json" ? "json" : "md";
  const path = await save({
    title: "Export session",
    defaultPath: defaultName,
    filters: [
      {
        name: format === "json" ? "MonoCode session (JSON)" : "Markdown",
        extensions: [extension],
      },
    ],
  });
  if (!path) return null;
  await writeTextFile(path, content);
  // Only JSON re-imports, so only those are worth offering back in the dialog.
  if (format === "json") {
    rememberSessionExport({ path, name: defaultName, format, at: Date.now() });
  }
  return path;
}

export async function pickSessionImportFile(): Promise<{
  path: string;
  text: string;
} | null> {
  const selected = await open({
    title: "Import session",
    multiple: false,
    directory: false,
    filters: [{ name: "MonoCode session (JSON)", extensions: ["json"] }],
  });
  if (!selected || Array.isArray(selected)) return null;
  const text = await readTextFile(selected);
  return { path: selected, text };
}
