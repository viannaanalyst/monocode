import { beforeEach, describe, expect, it } from "vitest";
import {
  isModelEnabled,
  isModelHidden,
  loadEnabledModels,
  pickerModelsFor,
  setHarnessModelsEnabled,
  setModelEnabled,
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

  it("starts with no models in the picker", () => {
    expect(loadEnabledModels().size).toBe(0);
    expect(pickerModelsFor("opencode")).toHaveLength(0);
  });

  it("opts a model into the picker without removing it from the catalog", () => {
    const [first] = modelsFor("opencode");
    setModelEnabled(first.id, true);

    expect(isModelEnabled(first.id)).toBe(true);
    expect(isModelHidden(first.id)).toBe(false);
    expect(
      pickerModelsFor("opencode").some((model) => model.id === first.id),
    ).toBe(true);
    expect(modelsFor("opencode").some((model) => model.id === first.id)).toBe(
      true,
    );

    setModelHidden(first.id, true);
    expect(pickerModelsFor("opencode")).toHaveLength(0);
  });

  it("enables or clears every model for a provider", () => {
    setHarnessModelsEnabled("opencode", true);
    expect(pickerModelsFor("opencode")).toHaveLength(
      modelsFor("opencode").length,
    );
    setHarnessModelsEnabled("opencode", false);
    expect(pickerModelsFor("opencode")).toHaveLength(0);
  });

  it("migrates a legacy hide-list into the opt-in list", () => {
    const [first, second] = modelsFor("opencode");
    localStorage.setItem(
      "monocode.hiddenModels",
      JSON.stringify([first.id]),
    );

    expect(isModelEnabled(second.id)).toBe(true);
    expect(isModelEnabled(first.id)).toBe(false);
    expect(
      pickerModelsFor("opencode").some((model) => model.id === first.id),
    ).toBe(false);
  });
});
