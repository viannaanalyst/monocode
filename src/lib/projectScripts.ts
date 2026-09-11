import { readTextFile } from "./fs";
import { joinPath } from "./paths";

export type ProjectScript = {
  name: string;
  command: string;
};

/** Project-local, git-excluded list of one-tap commands. */
export const PROJECT_SCRIPTS_FILE = ".monocode/scripts.json";

export function projectScriptsPath(cwd: string): string {
  return joinPath(cwd, PROJECT_SCRIPTS_FILE);
}

function scriptList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (Array.isArray(scripts)) return scripts;
  }
  return [];
}

export function parseProjectScripts(raw: string): ProjectScript[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const scripts: ProjectScript[] = [];
  for (const entry of scriptList(parsed)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { name?: unknown; command?: unknown };
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const command = typeof row.command === "string" ? row.command.trim() : "";
    if (name && command) scripts.push({ name, command });
  }
  return scripts;
}

export async function loadProjectScripts(
  cwd: string,
): Promise<ProjectScript[]> {
  if (!cwd || cwd === "~") return [];
  let raw: string;
  try {
    raw = await readTextFile(projectScriptsPath(cwd));
  } catch {
    return [];
  }
  return parseProjectScripts(raw);
}
