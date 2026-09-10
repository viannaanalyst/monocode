import type { ComponentType } from "react";
import Claude from "@lobehub/icons/es/Claude/components/Mono";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Mono";
import Gemini from "@lobehub/icons/es/Gemini/components/Mono";
import Groq from "@lobehub/icons/es/Groq/components/Mono";
import Kimi from "@lobehub/icons/es/Kimi/components/Mono";
import Meta from "@lobehub/icons/es/Meta/components/Mono";
import Minimax from "@lobehub/icons/es/Minimax/components/Mono";
import Mistral from "@lobehub/icons/es/Mistral/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Mono";
import Qwen from "@lobehub/icons/es/Qwen/components/Mono";
import XAI from "@lobehub/icons/es/XAI/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Mono";
import type { AgentModel } from "../lib/models";
import { HarnessIcon } from "./HarnessIcon";

/**
 * Brand marks keyed by vendor. We deep-import only the `Mono` glyph (an
 * `currentColor` SVG) so the heavy Avatar/Color wrappers and their `@lobehub/ui`
 * peer never enter the bundle.
 */
const BRANDS: {
  key: string;
  test: RegExp;
  Icon: ComponentType<{ size?: number | string; className?: string }>;
}[] = [
  { key: "deepseek", test: /deepseek/, Icon: DeepSeek },
  {
    key: "openai",
    test: /\b(gpt|chatgpt|codex|o1|o3|o4)\b/,
    Icon: OpenAI,
  },
  { key: "claude", test: /claude|sonnet|opus|haiku|fable|anthropic/, Icon: Claude },
  { key: "gemini", test: /gemini/, Icon: Gemini },
  { key: "xai", test: /grok|xai/, Icon: XAI },
  { key: "zhipu", test: /\bglm\b|zhipu|chatglm/, Icon: Zhipu },
  { key: "kimi", test: /kimi|moonshot/, Icon: Kimi },
  { key: "qwen", test: /qwen|alibaba/, Icon: Qwen },
  { key: "minimax", test: /minimax/, Icon: Minimax },
  { key: "mistral", test: /mistral|mixtral/, Icon: Mistral },
  { key: "meta", test: /llama|\bmeta\b/, Icon: Meta },
  { key: "perplexity", test: /perplexity|sonar/, Icon: Perplexity },
  { key: "openrouter", test: /openrouter/, Icon: OpenRouter },
  { key: "groq", test: /groq/, Icon: Groq },
];

function brandIcon(model: AgentModel) {
  const hay = `${model.name} ${model.id} ${model.nativeId ?? ""}`.toLowerCase();
  return BRANDS.find((brand) => brand.test.test(hay))?.Icon ?? null;
}

/** The model vendor's mark, falling back to the harness icon. */
export function ModelBrandIcon({
  model,
  className = "size-3.5",
}: {
  model: AgentModel;
  className?: string;
}) {
  const Icon = brandIcon(model);
  if (!Icon) return <HarnessIcon harness={model.harness} className={className} />;
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center ${className}`}
    >
      <Icon size="100%" />
    </span>
  );
}
