import { describe, expect, it } from "vitest";
import { isDangerousCommand } from "./dangerousCommands";

describe("isDangerousCommand", () => {
  it("flags destructive or mutating commands", () => {
    for (const command of [
      "rm -rf node_modules",
      "rm cache.db",
      "git reset --hard HEAD~1",
      "git clean -fd",
      "npm install",
      "pnpm add react",
      "cargo update",
      "brew upgrade",
      "DROP TABLE users",
      "DELETE FROM orders",
      "prisma migrate deploy",
      "sudo rm /etc/hosts",
      "chmod -R 777 .",
      "docker system prune -af",
    ]) {
      expect(isDangerousCommand(command), command).toBe(true);
    }
  });

  it("leaves read-only or ordinary commands alone", () => {
    for (const command of [
      "npm run dev",
      "pnpm test",
      "git status",
      "git diff",
      "cargo build",
      "ls -la",
      "cat a.txt",
      "grep -R TODO src",
      "",
    ]) {
      expect(isDangerousCommand(command), command).toBe(false);
    }
  });
});
