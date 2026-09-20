/**
 * Heuristics for shell commands worth snapshotting before they run, so a
 * single response can be undone even when the damage came from a command
 * rather than a structured file edit.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // Deleting / overwriting files.
  /(^|[;&|]\s*)rm\s+/,
  /\brm\s+-[a-z]*[rf]/i,
  /\bmv\s+/,
  /\b(truncate|shred|dd)\b/,
  // Git history / working tree destruction.
  /\bgit\s+reset\b/,
  /\bgit\s+clean\b/,
  /\bgit\s+checkout\s+--/,
  /\bgit\s+restore\b/,
  /\bgit\s+stash\s+(drop|clear)\b/,
  // Schema / migrations.
  /\b(drop|alter|truncate)\s+(table|database|schema)\b/i,
  /\bdelete\s+from\b/i,
  /\bmigrat(e|ion)\b/i,
  /\b(prisma|knex|alembic|sequelize|typeorm)\b.*\b(migrate|db:)/i,
  // Dependency installs / upgrades.
  /\b(npm|pnpm|yarn|bun)\s+(install|i|add|update|upgrade|remove|rm|uninstall)\b/i,
  /\b(pip|pip3|poetry|pipenv)\s+(install|add|uninstall|remove)\b/i,
  /\bcargo\s+(add|install|update|remove)\b/i,
  /\bgo\s+get\b/,
  /\bbrew\s+(install|upgrade|uninstall)\b/,
  /\b(apt|apt-get|yum|dnf|pacman)\s+(install|remove|upgrade|update)\b/i,
  // Containers and permissions.
  /\bdocker\s+(system\s+prune|rm|rmi|volume\s+rm|container\s+prune)\b/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  /\bsudo\b/,
];

export function isDangerousCommand(command: string): boolean {
  const text = command.trim();
  if (!text) return false;
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(text));
}
