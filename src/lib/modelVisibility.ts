import {
  modelsFor,
  onHarnessCatalogUpdated,
  type AgentModel,
} from "./models";
import { HARNESSES, type HarnessId } from "./session";

const HIDDEN_KEY = "monocode.hiddenModels";
const ENABLED_KEY = "monocode.enabledPickerModels";

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

function parseIdSet(raw: string | null): Set<string> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return null;
  }
}

function allCatalogIds(): string[] {
  return HARNESSES.flatMap((harness) =>
    modelsFor(harness).map((model) => model.id),
  );
}

/**
 * Opt-in list. Missing key with a legacy hide-list migrates that choice;
 * a fresh install starts with nothing in the picker.
 */
export function loadEnabledModels(): Set<string> {
  try {
    const enabled = parseIdSet(localStorage.getItem(ENABLED_KEY));
    if (enabled) return enabled;
    const hidden = parseIdSet(localStorage.getItem(HIDDEN_KEY));
    if (hidden) {
      const next = new Set(
        allCatalogIds().filter((id) => !hidden.has(id)),
      );
      saveEnabledModels(next);
      return next;
    }
  } catch {
    // private mode
  }
  return new Set();
}

function saveEnabledModels(enabled: Set<string>) {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...enabled]));
  } catch {
    // private mode / quota
  }
  notify();
}

export function isModelEnabled(id: string): boolean {
  return loadEnabledModels().has(id);
}

export function isModelHidden(id: string): boolean {
  return !isModelEnabled(id);
}

export function setModelEnabled(id: string, enabled: boolean) {
  const next = loadEnabledModels();
  if (enabled) next.add(id);
  else next.delete(id);
  saveEnabledModels(next);
}

export function setModelHidden(id: string, hidden: boolean) {
  setModelEnabled(id, !hidden);
}

export function setHarnessModelsEnabled(harness: HarnessId, enabled: boolean) {
  const next = loadEnabledModels();
  for (const model of modelsFor(harness)) {
    if (enabled) next.add(model.id);
    else next.delete(model.id);
  }
  saveEnabledModels(next);
}

/** Models a provider offers that the user turned on for the picker. */
export function pickerModelsFor(harness: HarnessId): AgentModel[] {
  const enabled = loadEnabledModels();
  return modelsFor(harness).filter((model) => enabled.has(model.id));
}

export function hiddenModelCount(harness: HarnessId): number {
  const enabled = loadEnabledModels();
  return modelsFor(harness).filter((model) => !enabled.has(model.id)).length;
}

/** Stable slug for matching catalog ids across static and live OpenCode ids. */
export function modelCatalogKey(id: string): string {
  const trimmed = id.trim();
  const colon = trimmed.indexOf(":");
  let slug = colon >= 0 ? trimmed.slice(colon + 1) : trimmed;
  const bracket = slug.indexOf("[");
  if (bracket >= 0) slug = slug.slice(0, bracket);
  const slash = slug.lastIndexOf("/");
  return slash >= 0 ? slug.slice(slash + 1) : slug;
}

function catalogKeyIndex(catalog: AgentModel[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const model of catalog) {
    index.set(modelCatalogKey(model.id), model.id);
    if (model.nativeId) index.set(modelCatalogKey(model.nativeId), model.id);
  }
  return index;
}

/** Keep opt-in picker entries when a live CLI catalog rewrites model ids. */
export function remapEnabledPickerModels(harness: HarnessId): void {
  const enabled = loadEnabledModels();
  const catalog = modelsFor(harness);
  const catalogIds = new Set(catalog.map((model) => model.id));
  const byKey = catalogKeyIndex(catalog);
  const next = new Set(enabled);
  let changed = false;

  for (const id of enabled) {
    if (!id.startsWith(`${harness}:`)) continue;
    if (catalogIds.has(id)) continue;
    const replacement = byKey.get(modelCatalogKey(id));
    if (!replacement || replacement === id) continue;
    next.delete(id);
    next.add(replacement);
    changed = true;
  }

  if (changed) saveEnabledModels(next);
}

onHarnessCatalogUpdated(remapEnabledPickerModels);
