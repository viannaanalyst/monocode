import type { Session } from "./session";

/**
 * What an agent did in a session, derived from its tool transcript. File
 * changes come from the checkpoint review; this adds the commands, tests and
 * commits, which never reach the changed-files list.
 */
export type SessionActivity = {
  files: string[];
  commands: string[];
  tests: string[];
  commits: string[];
};

const TEST_COMMAND =
  /\b(vitest|jest|pytest|playwright|cypress|rspec|phpunit|mocha|ava|go test|cargo test|npm test|npm run test|yarn test|pnpm test|bun test|deno test|ctest|dotnet test|mvn test|gradle test|swift test|xcodebuild test)\b/i;

const COMMIT_COMMAND = /\bgit\s+commit\b/i;

export function sessionActivity(session: Session): SessionActivity {
  const files = new Set<string>();
  const commands: string[] = [];
  const seen = new Set<string>();
  const tests: string[] = [];
  const commits: string[] = [];

  for (const block of session.blocks) {
    if (block.role !== "tool" || !block.tool) continue;
    const kind = (block.tool.kind ?? "").toLowerCase();
    if (kind === "edit" || kind === "write") {
      const path = block.tool.preview?.path?.trim();
      if (path) files.add(path);
    }
    if (kind !== "execute") continue;
    const command = firstLine(block.tool.detail) ?? firstLine(block.text);
    if (!command || seen.has(command)) continue;
    seen.add(command);
    commands.push(command);
    if (TEST_COMMAND.test(command)) tests.push(command);
    else if (COMMIT_COMMAND.test(command)) commits.push(command);
  }

  return { files: [...files], commands, tests, commits };
}

function firstLine(value: string | undefined): string | undefined {
  const line = value?.split(/\r?\n/)[0]?.trim();
  return line ? line : undefined;
}

/** True when the session has anything worth surfacing beyond file diffs. */
export function hasSessionActivity(activity: SessionActivity): boolean {
  return activity.commands.length > 0;
}
