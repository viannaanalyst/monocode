/** Turn an address-bar string into a loadable URL. */
export function normalizeBrowserUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (value.includes(" ") || !value.includes(".")) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }
  return `https://${value}`;
}

export function browserTabLabel(url: string, title?: string): string {
  const page = title?.trim();
  if (page) return shortenTabTitle(page);
  if (!url || url === "about:blank") return "Browser";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Browser";
  } catch {
    return "Browser";
  }
}

/** Cursor-style short tab: "Google" from "Google", "GitHub" from "GitHub: …". */
export function shortenTabTitle(title: string): string {
  const cut = title.split(/\s+[—–|:]\s+/)[0]?.trim() || title.trim();
  return cut.slice(0, 28);
}

export function browserFaviconUrl(pageUrl: string): string | null {
  if (!pageUrl || pageUrl === "about:blank") return null;
  try {
    const host = new URL(pageUrl).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return null;
  }
}

export function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function browserHost(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** `*` allows every host. Empty list allows only localhost. */
export function hostAllowed(url: string, allowlist: string[]): boolean {
  const host = browserHost(url);
  if (!host) return false;
  const rules = allowlist.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return isLocalhostUrl(url);
  if (rules.includes("*")) return true;
  return rules.some(
    (rule) => host === rule || host.endsWith(`.${rule}`),
  );
}

export function browserDataStoreId(cwd: string): number[] {
  const bytes = new Uint8Array(16);
  let hash = 2166136261;
  const input = `monocode-browser:${cwd}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    bytes[i % 16] ^= hash & 255;
    bytes[(i + 5) % 16] ^= (hash >>> 8) & 255;
    bytes[(i + 11) % 16] ^= (hash >>> 16) & 255;
  }
  if (bytes.every((value) => value === 0)) bytes[0] = 1;
  return Array.from(bytes);
}

export const OPEN_IN_BROWSER_EVENT = "monocode:open-in-browser";

export function openInAppBrowser(url: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string>(OPEN_IN_BROWSER_EVENT, { detail: url }),
  );
}
