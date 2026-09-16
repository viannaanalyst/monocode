import { describe, expect, it } from "vitest";
import { modelBrandColor, modelBrandEnergy, modelVendor } from "./modelBrand";

describe("modelBrandColor", () => {
  it("maps vendors to their brand colors", () => {
    expect(modelBrandColor("DeepSeek V4.1 Flash")).toBe("#A855F7");
    expect(modelBrandColor("claude-sonnet-4")).toBe("#D97757");
    expect(modelBrandColor("gemini-2.5-pro")).toBe("#4796E3");
    expect(modelBrandColor("qwen3-coder")).toBe("#6F69F7");
    expect(modelBrandColor("kimi-k2")).toBe("#1783FF");
    expect(modelBrandColor("glm-4.6")).toBe("#3859FF");
    expect(modelBrandColor("minimax-m1")).toBe("#FE603C");
    expect(modelBrandColor("mistral-large")).toBe("#FFAF00");
    expect(modelBrandColor("llama-4")).toBe("#0082FB");
    expect(modelBrandColor("sonar-pro")).toBe("#22B8CD");
    expect(modelBrandColor("openrouter/auto")).toBe("#6467F2");
  });

  it("gives the OpenAI family codex blue and cursor/grok their ramps", () => {
    expect(modelBrandColor("gpt-5")).toBe("#24A8FF");
    expect(modelBrandColor("codex-mini")).toBe("#24A8FF");
    expect(modelBrandColor("grok-4")).toBe("#DDEEFF");
    expect(modelBrandColor("cursor:composer-2.5")).toBe("#CBD5E1");
    expect(modelBrandColor("groq")).toBe("var(--color-content)");
  });

  it("exposes the energy ramp per vendor and derives one otherwise", () => {
    expect(modelBrandEnergy("DeepSeek V4.1 Flash")).toEqual({
      a: "#6D28D9",
      b: "#A855F7",
      c: "#E9D5FF",
    });
    expect(modelBrandEnergy("claude-sonnet-4")).toEqual({
      a: "#D97757",
      b: "#FF9A55",
      c: "#FFE0B5",
    });
    expect(modelBrandEnergy("gpt-5")).toEqual({
      a: "#0969FF",
      b: "#24A8FF",
      c: "#BCEBFF",
    });
    expect(modelBrandEnergy("grok-4")).toEqual({
      a: "#7C9CBF",
      b: "#DDEEFF",
      c: "#FFFFFF",
    });
    expect(modelBrandEnergy("cursor:composer-2.5")).toEqual({
      a: "#64748B",
      b: "#CBD5E1",
      c: "#FFFFFF",
    });
    const derived = modelBrandEnergy("unknown-model");
    expect(derived.a).toBe("#8B8B93");
    expect(derived.b).toContain("color-mix");
    expect(derived.c).toContain("color-mix");
  });

  it("falls back for unknown models", () => {
    expect(modelVendor("auto")).toBeUndefined();
    expect(modelBrandColor("Composer 2.5")).toBe("#CBD5E1");
  });
});
