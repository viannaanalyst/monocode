import { HARNESSES, type HarnessId } from "./session";

export const PROVIDER_ORDER_KEY = "monocode.providerOrder";
export const PROVIDER_ORDER_CHANGE_EVENT = "monocode:provider-order-change";

let version = 0;
const listeners = new Set<() => void>();

function isHarnessId(value: unknown): value is HarnessId {
  return (
    typeof value === "string" &&
    (HARNESSES as readonly string[]).includes(value)
  );
}

export function mergeProviderOrder(
  saved: readonly unknown[],
  available: readonly HarnessId[],
): HarnessId[] {
  const allowed = new Set(available);
  const merged: HarnessId[] = [];
  const seen = new Set<HarnessId>();
  for (const value of saved) {
    if (!isHarnessId(value) || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }
  for (const id of available) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function loadProviderOrder(): HarnessId[] {
  try {
    const raw = localStorage.getItem(PROVIDER_ORDER_KEY);
    if (!raw) return [...HARNESSES];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...HARNESSES];
    return mergeProviderOrder(parsed, HARNESSES);
  } catch {
    return [...HARNESSES];
  }
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROVIDER_ORDER_CHANGE_EVENT));
  }
}

export function saveProviderOrder(ids: readonly HarnessId[]): void {
  const next = mergeProviderOrder(ids, HARNESSES);
  try {
    localStorage.setItem(PROVIDER_ORDER_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
  notify();
}

export function moveProvider<T extends string>(
  order: readonly T[],
  id: T,
  delta: -1 | 1,
): T[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function orderedHarnesses(
  available?: (harness: HarnessId) => boolean,
): HarnessId[] {
  const allowed = available ? HARNESSES.filter(available) : [...HARNESSES];
  return mergeProviderOrder(loadProviderOrder(), allowed);
}

export function subscribeProviderOrder(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProviderOrderSnapshot(): number {
  return version;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== PROVIDER_ORDER_KEY) return;
    notify();
  });
}
