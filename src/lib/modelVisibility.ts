import { modelsFor, type AgentModel } from "./models";
import type { HarnessId } from "./session";

const KEY = "monocode.hiddenModels";

let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeModelVisibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function modelVisibilityVersion(): number {
  return version;
}

export function loadHiddenModels(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveHiddenModels(hidden: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...hidden]));
  } catch {
    // private mode / quota
  }
  notify();
}

export function isModelHidden(id: string): boolean {
  return loadHiddenModels().has(id);
}

export function setModelHidden(id: string, hidden: boolean) {
  const next = loadHiddenModels();
  if (hidden) next.add(id);
  else next.delete(id);
  saveHiddenModels(next);
}

/** Models a provider offers, minus the ones the user hid from the picker. */
export function pickerModelsFor(harness: HarnessId): AgentModel[] {
  const hidden = loadHiddenModels();
  return modelsFor(harness).filter((model) => !hidden.has(model.id));
}

export function hiddenModelCount(harness: HarnessId): number {
  const hidden = loadHiddenModels();
  return modelsFor(harness).filter((model) => hidden.has(model.id)).length;
}
