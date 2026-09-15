import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));
/** Any arbitrary text size except the two literals the scale keeps. */
const BANNED_TEXT = /text-\[(?!12px\]|10px\])[0-9.]+px\]/;
const BANNED_WEIGHT = ["font-bold"];
const BANNED_ICON = ["size-2.5"];
/** `size-2` stays on project mascots, RailAction's status dot, and the color-swatch glyph. */
const SIZE_2_FILES = new Set([
  "chrome/ProjectRail.tsx",
  "chrome/RailAction.tsx",
  "chrome/ColorPickerPopover.tsx",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("typography scale", () => {
  it("keeps retired sizes, weights, and icon sizes out of the source", () => {
    const offenders: string[] = [];
    for (const dir of ["chrome", "surfaces", "hooks", "lib"].map((name) =>
      join(SRC, name),
    )) {
      for (const file of sourceFiles(dir)) {
        const source = readFileSync(file, "utf8");
        for (const line of source.split("\n")) {
          if (BANNED_TEXT.test(line)) {
            offenders.push(`${file.slice(SRC.length)}: ${line.match(BANNED_TEXT)?.[0]}`);
          }
          for (const banned of [...BANNED_WEIGHT, ...BANNED_ICON]) {
            if (line.includes(banned)) {
              offenders.push(`${file.slice(SRC.length)}: ${banned}`);
            }
          }
          if (
            !SIZE_2_FILES.has(file.slice(SRC.length)) &&
            line.includes("size-2 ")
          ) {
            offenders.push(`${file.slice(SRC.length)}: size-2`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
