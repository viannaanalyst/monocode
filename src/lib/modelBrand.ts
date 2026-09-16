/**
 * Model vendors in match order, with the brand color the composer's effort bar
 * and titles follow. Monochrome marks (OpenAI, xAI, Groq) carry
 * `var(--color-content)` so they stay white in dark mode and legible in light.
 */
export type ModelVendor = {
  id: string;
  test: RegExp;
  color: string;
  /** Three-stop ramp for the effort bar's energy fill (dark → mid → light). */
  energy?: readonly [string, string, string];
};

export const MODEL_VENDORS: ModelVendor[] = [
  {
    id: "astra",
    test: /(^|[^a-z0-9])astra([^a-z0-9]|$)/,
    color: "#d8c9a2",
    energy: ["#a89560", "#d8c9a2", "#f5f0e4"],
  },
  { id: "deepseek", test: /deepseek/, color: "#A855F7", energy: ["#6D28D9", "#A855F7", "#E9D5FF"] },
  {
    id: "openai",
    test: /\b(gpt|chatgpt|codex|o1|o3|o4)\b/,
    color: "#24A8FF",
    energy: ["#0969FF", "#24A8FF", "#BCEBFF"],
  },
  {
    id: "claude",
    test: /claude|sonnet|opus|haiku|fable|anthropic/,
    color: "#D97757",
    energy: ["#D97757", "#FF9A55", "#FFE0B5"],
  },
  { id: "gemini", test: /gemini/, color: "#4796E3" },
  { id: "xai", test: /grok|xai/, color: "#DDEEFF", energy: ["#7C9CBF", "#DDEEFF", "#FFFFFF"] },
  { id: "zhipu", test: /\bglm\b|zhipu|chatglm/, color: "#3859FF" },
  { id: "kimi", test: /kimi|moonshot/, color: "#1783FF" },
  { id: "qwen", test: /qwen|alibaba/, color: "#6F69F7" },
  { id: "minimax", test: /minimax/, color: "#FE603C" },
  { id: "mistral", test: /mistral|mixtral/, color: "#FFAF00" },
  { id: "meta", test: /llama|\bmeta\b/, color: "#0082FB" },
  { id: "perplexity", test: /perplexity|sonar/, color: "#22B8CD" },
  { id: "openrouter", test: /openrouter/, color: "#6467F2" },
  { id: "cursor", test: /cursor|composer/, color: "#CBD5E1", energy: ["#64748B", "#CBD5E1", "#FFFFFF"] },
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

export type ModelEnergy = { a: string; b: string; c: string };

/** The nebula ramp for the effort fill: dark edge, body, near-white crest. */
export function modelBrandEnergy(text: string): ModelEnergy {
  const vendor = modelVendor(text);
  const ramp = vendor?.energy;
  if (ramp) return { a: ramp[0], b: ramp[1], c: ramp[2] };
  const base = vendor?.color ?? "#8B8B93";
  return {
    a: base,
    b: `color-mix(in srgb, ${base} 62%, white)`,
    c: `color-mix(in srgb, ${base} 22%, white)`,
  };
}
