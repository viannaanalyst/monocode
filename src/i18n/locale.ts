export type Locale = "en" | "pt-BR";

export const LOCALES: { id: Locale; nativeLabel: string }[] = [
  { id: "en", nativeLabel: "English" },
  { id: "pt-BR", nativeLabel: "Português (Brasil)" },
];

const KEY = "monocode.locale";
export const LOCALE_CHANGE_EVENT = "monocode:locale-change";
export const LOCALE_DEFAULT: Locale = "en";

let current: Locale | null = null;
const listeners = new Set<() => void>();

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "pt-BR";
}

function isTestEnv(): boolean {
  try {
    return import.meta.env.MODE === "test";
  } catch {
    return false;
  }
}

function detectLocale(): Locale {
  if (isTestEnv()) return LOCALE_DEFAULT;
  try {
    const stored = localStorage.getItem(KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // private mode / quota
  }
  const language =
    typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return language.startsWith("pt") ? "pt-BR" : LOCALE_DEFAULT;
}

export function getLocale(): Locale {
  if (!current) current = detectLocale();
  return current;
}

export function loadLocale(): Locale {
  return getLocale();
}

export function saveLocale(locale: Locale) {
  current = locale;
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // private mode / quota
  }
  for (const listener of listeners) listener();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: locale }),
  );
}

export function subscribeLocale(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** Tests and scripts can pin English without touching localStorage. */
export function resetLocaleForTests() {
  current = LOCALE_DEFAULT;
}
