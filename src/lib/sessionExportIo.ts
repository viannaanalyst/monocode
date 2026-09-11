import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "./fs";
import type { SessionExportFormat } from "./sessionExport";

export async function saveSessionExport(
  defaultName: string,
  content: string,
  format: SessionExportFormat,
): Promise<boolean> {
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
  if (!path) return false;
  await writeTextFile(path, content);
  return true;
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
