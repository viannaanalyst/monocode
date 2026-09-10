import { getLocale, type Locale } from "./locale";
import { PT_BR } from "./pt-BR";

export type TVars = Record<string, string | number>;

const SHORTCUT_TAIL = /^(.*) \(([^()]*)\)$/;

function lookup(key: string, locale: Locale): string {
  if (locale !== "pt-BR") return key;
  const direct = PT_BR[key];
  if (direct) return direct;
  const match = SHORTCUT_TAIL.exec(key);
  if (!match) return key;
  const head = PT_BR[match[1]];
  return head ? `${head} (${match[2]})` : key;
}

export function t(key: string, vars?: TVars): string {
  let out = lookup(key, getLocale());
  if (!vars) return out;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

/** Label plus accelerator, e.g. `Ir para arquivo (⌘P)`. */
export function withShortcut(label: string, shortcut: string): string {
  return `${t(label)} (${shortcut})`;
}
