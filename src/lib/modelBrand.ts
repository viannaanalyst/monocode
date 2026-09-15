/**
 * Model vendors in match order, with the brand color the composer's effort bar
 * and titles follow. Monochrome marks (OpenAI, xAI, Groq) carry
 * `var(--color-content)` so they stay white in dark mode and legible in light.
 */
export type ModelVendor = { id: string; test: RegExp; color: string };

export const MODEL_VENDORS: ModelVendor[] = [
  { id: "deepseek", test: /deepseek/, color: "#4D6BFE" },
  {
    id: "openai",
    test: /\b(gpt|chatgpt|codex|o1|o3|o4)\b/,
    color: "var(--color-content)",
  },
  {
    id: "claude",
    test: /claude|sonnet|opus|haiku|fable|anthropic/,
    color: "#D97757",
  },
  { id: "gemini", test: /gemini/, color: "#4796E3" },
  { id: "xai", test: /grok|xai/, color: "var(--color-content)" },
  { id: "zhipu", test: /\bglm\b|zhipu|chatglm/, color: "#3859FF" },
  { id: "kimi", test: /kimi|moonshot/, color: "#1783FF" },
  { id: "qwen", test: /qwen|alibaba/, color: "#6F69F7" },
  { id: "minimax", test: /minimax/, color: "#FE603C" },
  { id: "mistral", test: /mistral|mixtral/, color: "#FFAF00" },
  { id: "meta", test: /llama|\bmeta\b/, color: "#0082FB" },
  { id: "perplexity", test: /perplexity|sonar/, color: "#22B8CD" },
  { id: "openrouter", test: /openrouter/, color: "#6467F2" },
  { id: "groq", test: /groq/, color: "var(--color-content)" },
];

export function modelVendor(text: string): ModelVendor | undefined {
  const hay = text.toLowerCase();
  return MODEL_VENDORS.find((entry) => entry.test.test(hay));
}

/** The color the effort bar and its titles take for this model. */
export function modelBrandColor(text: string): string {
  return modelVendor(text)?.color ?? "var(--color-content)";
}
