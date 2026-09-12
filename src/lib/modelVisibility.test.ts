import { beforeEach, describe, expect, it } from "vitest";
import {
  isModelHidden,
  loadHiddenModels,
  pickerModelsFor,
  setModelHidden,
} from "./modelVisibility";
import { modelsFor } from "./models";

function mockStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
    },
    configurable: true,
  });
}

describe("model visibility", () => {
  beforeEach(mockStorage);

  it("starts with every model visible", () => {
    expect(loadHiddenModels().size).toBe(0);
    expect(pickerModelsFor("opencode")).toHaveLength(
      modelsFor("opencode").length,
    );
  });

  it("hides a model from the picker without removing it from the catalog", () => {
    const [first] = modelsFor("opencode");
    setModelHidden(first.id, true);

    expect(isModelHidden(first.id)).toBe(true);
    expect(pickerModelsFor("opencode").some((model) => model.id === first.id)).toBe(
      false,
    );
    expect(modelsFor("opencode").some((model) => model.id === first.id)).toBe(
      true,
    );

    setModelHidden(first.id, false);
    expect(pickerModelsFor("opencode")).toHaveLength(
      modelsFor("opencode").length,
    );
  });
});
