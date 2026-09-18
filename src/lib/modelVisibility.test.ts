import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isModelEnabled,
  isModelHidden,
  loadEnabledModels,
  modelCatalogKey,
  pickerModelsFor,
  remapEnabledPickerModels,
  setHarnessModelsEnabled,
  setModelEnabled,
  setModelHidden,
} from "./modelVisibility";
import { modelsFor, resetHarnessModelOverlays, setHarnessModels } from "./models";

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
  afterEach(() => {
    resetHarnessModelOverlays();
  });

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

  it("normalizes catalog keys across provider prefixes", () => {
    expect(modelCatalogKey("opencode:deepseek-v4.1-flash")).toBe(
      "deepseek-v4.1-flash",
    );
    expect(modelCatalogKey("opencode:opencode-go/deepseek-v4.1-flash")).toBe(
      "deepseek-v4.1-flash",
    );
  });

  it("remaps enabled picker ids when a live catalog rewrites them", () => {
    resetHarnessModelOverlays();
    setModelEnabled("opencode:deepseek-v4.1-flash", true);
    setHarnessModels("opencode", [
      {
        id: "opencode:opencode-go/deepseek-v4.1-flash",
        harness: "opencode",
        name: "DeepSeek V4.1 Flash",
        nativeId: "opencode-go/deepseek-v4.1-flash",
      },
    ]);

    expect(isModelEnabled("opencode:deepseek-v4.1-flash")).toBe(false);
    expect(isModelEnabled("opencode:opencode-go/deepseek-v4.1-flash")).toBe(
      true,
    );
    expect(
      pickerModelsFor("opencode").some(
        (model) => model.id === "opencode:opencode-go/deepseek-v4.1-flash",
      ),
    ).toBe(true);
  });

  it("remaps stale enabled ids without waiting for setHarnessModels", () => {
    resetHarnessModelOverlays();
    setHarnessModels("opencode", [
      {
        id: "opencode:opencode-go/deepseek-v4.1-flash",
        harness: "opencode",
        name: "DeepSeek V4.1 Flash",
        nativeId: "opencode-go/deepseek-v4.1-flash",
      },
    ]);
    localStorage.setItem(
      "monocode.enabledPickerModels",
      JSON.stringify(["opencode:deepseek-v4.1-flash"]),
    );

    remapEnabledPickerModels("opencode");

    expect(isModelEnabled("opencode:opencode-go/deepseek-v4.1-flash")).toBe(
      true,
    );
    expect(pickerModelsFor("opencode")).toHaveLength(1);
  });
});
