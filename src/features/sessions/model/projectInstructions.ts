import { readTextFile, writeTextFile } from "../../../platform/tauri/fs";
import { joinPath } from "../../../shared/lib/paths";

/**
 * Project instructions live in `AGENTS.md`, which Codex and opencode read
 * natively. Claude Code reads `CLAUDE.md`, so we offer an `@AGENTS.md` import
 * bridge instead of duplicating the text.
 */
export const AGENTS_FILENAME = "AGENTS.md";
export const CLAUDE_FILENAME = "CLAUDE.md";
export const CLAUDE_BRIDGE = "@AGENTS.md";

export type ProjectInstructions = {
  agents: string;
  claude: string;
  agentsExists: boolean;
};

export function agentsPath(cwd: string): string {
  return joinPath(cwd, AGENTS_FILENAME);
}

export function claudePath(cwd: string): string {
  return joinPath(cwd, CLAUDE_FILENAME);
}

/** The `CLAUDE.md` body that imports AGENTS.md, or null when already linked. */
export function claudeBridgeContent(existing: string): string | null {
  if (existing.includes(CLAUDE_BRIDGE)) return null;
  const trimmed = existing.trimEnd();
  if (!trimmed) return `${CLAUDE_BRIDGE}\n`;
  return `${trimmed}\n\n${CLAUDE_BRIDGE}\n`;
}

export async function loadProjectInstructions(
  cwd: string,
): Promise<ProjectInstructions> {
  const [agents, claude] = await Promise.all([
    readTextFile(agentsPath(cwd)).catch(() => null),
    readTextFile(claudePath(cwd)).catch(() => null),
  ]);
  return {
    agents: agents ?? "",
    claude: claude ?? "",
    agentsExists: agents != null,
  };
}

export async function saveProjectInstructions(input: {
  cwd: string;
  agents: string;
  writeClaudeBridge: boolean;
  existingClaude: string;
}): Promise<void> {
  await writeTextFile(agentsPath(input.cwd), ensureTrailingNewline(input.agents));
  if (!input.writeClaudeBridge) return;
  const bridge = claudeBridgeContent(input.existingClaude);
  if (bridge == null) return;
  await writeTextFile(claudePath(input.cwd), bridge);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
