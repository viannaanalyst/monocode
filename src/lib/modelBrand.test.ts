import { describe, expect, it } from "vitest";
import { modelBrandColor, modelVendor } from "./modelBrand";

describe("modelBrandColor", () => {
  it("maps vendors to their brand colors", () => {
    expect(modelBrandColor("DeepSeek V4.1 Flash")).toBe("#4D6BFE");
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

  it("keeps monochrome marks on the content color", () => {
    for (const text of [
      "gpt-5",
      "codex-mini",
      "grok-4",
      "cursor:composer-2.5",
      "groq",
    ]) {
      expect(modelBrandColor(text)).toBe("var(--color-content)");
    }
  });

  it("falls back to the content color for unknown models", () => {
    expect(modelVendor("auto")).toBeUndefined();
    expect(modelBrandColor("Composer 2.5")).toBe("var(--color-content)");
  });
});
