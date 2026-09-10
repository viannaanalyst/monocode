import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");
const dictSrc = readFileSync(join(SRC, "i18n/pt-BR.ts"), "utf8");
const keys = [
  ...dictSrc.matchAll(/^\s*(?:["']([^"']+)["']|([A-Za-z][\w ….—–\-'?,]*)\s*):/gm),
]
  .map((m) => m[1] ?? m[2])
  .filter((k) => k && k.length >= 3)
  .sort((a, b) => b.length - a.length);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
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
  let rel = relative(from, join(SRC, "i18n")).replaceAll("\\", "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function ensureImport(src, file) {
  if (/\bfrom ["'][^"']*i18n["']/.test(src)) return src;
  const importLine = `import { t } from "${importPath(file)}";\n`;
  const lastImport = [...src.matchAll(/^import .+$/gm)].at(-1);
  if (lastImport) {
    const idx = lastImport.index + lastImport[0].length;
    return `${src.slice(0, idx)}\n${importLine}${src.slice(idx)}`;
  }
  return importLine + src;
}

function wrapKey(key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const encoded = JSON.stringify(key);
  return { esc, encoded };
}

function wrapFile(file) {
  let src = readFileSync(file, "utf8");
  const original = src;
  for (const key of keys) {
    const { esc, encoded } = wrapKey(key);
    src = src.replaceAll(`>${key}<`, `>{t(${encoded})}<`);
    src = src.replace(
      new RegExp(`\\?\\s*"${esc}"\\s*:\\s*"${esc}"`, "g"),
      `? t(${encoded}) : t(${encoded})`,
    );
  }

  src = src.replace(
    /\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g,
    (all, a, b) => {
      if (!keys.includes(a) && !keys.includes(b)) return all;
      if (all.includes("t(")) return all;
      const left = keys.includes(a) ? `t(${JSON.stringify(a)})` : JSON.stringify(a);
      const right = keys.includes(b) ? `t(${JSON.stringify(b)})` : JSON.stringify(b);
      return `? ${left} : ${right}`;
    },
  );

  if (src === original) return false;
  src = ensureImport(src, file);
  writeFileSync(file, src);
  return true;
}

let count = 0;
for (const file of [
  ...walk(join(SRC, "chrome")),
  ...walk(join(SRC, "surfaces")),
  join(SRC, "App.tsx"),
]) {
  if (wrapFile(file)) {
    count += 1;
    console.log(relative(ROOT, file));
  }
}
console.log(`jsx-wrapped ${count} files`);
