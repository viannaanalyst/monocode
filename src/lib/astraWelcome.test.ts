import { describe, expect, it } from "vitest";
import type { AgentModel } from "./models";
import { isAstraModel, modelWelcomeEnergy } from "./astraWelcome";

const astra: AgentModel = {
  id: "codex:gpt-6-astra",
  harness: "codex",
  name: "Astra",
};

describe("Astra welcome", () => {
  it("recognizes Astra in catalog names and IDs without matching unrelated names", () => {
    expect(isAstraModel(astra)).toBe(true);
    expect(isAstraModel({ ...astra, id: "codex:new", name: "ASTRA" })).toBe(
      true,
    );
    expect(isAstraModel({ ...astra, name: "New model" })).toBe(true);
    expect(
      isAstraModel({
        ...astra,
        id: "pi:new",
        name: "New",
        nativeId: "openai/astra",
      }),
    ).toBe(true);
    expect(isAstraModel({ ...astra, id: "pi:astral", name: "Astral" })).toBe(
      false,
    );
  });

  it("recolors the welcome with the vendor energy ramp", () => {
    expect(modelWelcomeEnergy(astra)).toEqual({
      a: "#a89560",
      b: "#d8c9a2",
      c: "#f5f0e4",
    });
    expect(
      modelWelcomeEnergy({
        id: "claude:sonnet",
        harness: "claude",
        name: "Sonnet",
      }),
    ).toEqual({
      a: "#D97757",
      b: "#FF9A55",
      c: "#FFE0B5",
    });
  });
});
