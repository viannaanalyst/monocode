import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");

const ATTRS = ["title", "aria-label", "placeholder", "label", "description"];
const SKIP = new Set([
  "glpat-…",
  "lin_api-…",
  "lin_api_…",
  "skill-name",
  "https://gitlab.com",
  "pac-man",
  "snake",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "i18n") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name) && !name.includes(".test.")) {
      out.push(p);
    }
  }
  return out;
}

function importPath(file) {
  const from = dirname(file);
  const target = join(SRC, "i18n");
  let rel = relative(from, target).replaceAll("\\", "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function shouldWrap(value) {
  if (SKIP.has(value)) return false;
  if (value.length < 2 || value.length > 220) return false;
  if (value.startsWith("http")) return false;
  if (value.includes("/") && !value.includes(" ")) return false;
  if (/^[a-z0-9_-]+$/.test(value) && value.length < 4) return false;
  return /[A-Za-zÀ-ÿ]/.test(value);
}

function wrapFile(file) {
  let src = readFileSync(file, "utf8");
  const original = src;
  let changed = false;

  for (const attr of ATTRS) {
    const re = new RegExp(`(\\b${attr})=\"([^\"]+)\"`, "g");
    src = src.replace(re, (all, name, value) => {
      if (!shouldWrap(value)) return all;
      changed = true;
      return `${name}={t(${JSON.stringify(value)})}`;
    });
  }

  src = src.replace(
    /\b(label|title|description|placeholder):\s*"([^"]+)"/g,
    (all, name, value) => {
      if (!shouldWrap(value)) return all;
      if (all.includes("t(")) return all;
      changed = true;
      return `${name}: t(${JSON.stringify(value)})`;
    },
  );

  if (!changed) return false;

  if (!/\bimport\s*\{[^}]*\bt\b/.test(src) && !/from ["'].*i18n["']/.test(src)) {
    const spec = importPath(file);
    const importLine = `import { t } from "${spec}";\n`;
    const lastImport = [...src.matchAll(/^import .+$/gm)].at(-1);
    if (lastImport) {
      const idx = lastImport.index + lastImport[0].length;
      src = `${src.slice(0, idx)}\n${importLine}${src.slice(idx)}`;
    } else {
      src = importLine + src;
    }
  }

  writeFileSync(file, src);
  return true;
}

const files = [
  ...walk(join(SRC, "chrome")),
  ...walk(join(SRC, "surfaces")),
  join(SRC, "App.tsx"),
];

let count = 0;
for (const file of files) {
  if (wrapFile(file)) {
    count += 1;
    console.log(relative(ROOT, file));
  }
}
console.log(`wrapped ${count} files`);
