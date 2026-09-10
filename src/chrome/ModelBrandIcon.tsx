import type { ComponentType } from "react";
import Claude from "@lobehub/icons/es/Claude/components/Color";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Color";
import Gemini from "@lobehub/icons/es/Gemini/components/Color";
import Groq from "@lobehub/icons/es/Groq/components/Mono";
import Kimi from "@lobehub/icons/es/Kimi/components/Color";
import Meta from "@lobehub/icons/es/Meta/components/Color";
import Minimax from "@lobehub/icons/es/Minimax/components/Color";
import Mistral from "@lobehub/icons/es/Mistral/components/Color";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Color";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Color";
import Qwen from "@lobehub/icons/es/Qwen/components/Color";
import XAI from "@lobehub/icons/es/XAI/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Color";
import codexMark from "../assets/providers/codex.svg";
import type { AgentModel } from "../lib/models";
import type { HarnessId } from "../lib/session";
import { HarnessIcon } from "./HarnessIcon";

type LobeIcon = ComponentType<{ size?: number | string; className?: string }>;

/**
 * Brand marks keyed by vendor. We deep-import the glyph components (colored
 * `Color` where a brand palette exists, monochrome `Mono` otherwise) so the
 * heavy Avatar/Combine wrappers and their `@lobehub/ui` peer stay out of the
 * bundle. OpenAI reuses the Codex mark the app already ships.
 */
const BRANDS: { test: RegExp; Icon?: LobeIcon; image?: string }[] = [
  { test: /deepseek/, Icon: DeepSeek },
  { test: /\b(gpt|chatgpt|codex|o1|o3|o4)\b/, image: codexMark },
  { test: /claude|sonnet|opus|haiku|fable|anthropic/, Icon: Claude },
  { test: /gemini/, Icon: Gemini },
  { test: /grok|xai/, Icon: XAI },
  { test: /\bglm\b|zhipu|chatglm/, Icon: Zhipu },
  { test: /kimi|moonshot/, Icon: Kimi },
  { test: /qwen|alibaba/, Icon: Qwen },
  { test: /minimax/, Icon: Minimax },
  { test: /mistral|mixtral/, Icon: Mistral },
  { test: /llama|\bmeta\b/, Icon: Meta },
  { test: /perplexity|sonar/, Icon: Perplexity },
  { test: /openrouter/, Icon: OpenRouter },
  { test: /groq/, Icon: Groq },
];

/** The model vendor's mark from free text, falling back to the harness icon. */
export function ModelBrandMark({
  text,
  harness,
  className = "size-3.5",
}: {
  text: string;
  harness?: HarnessId;
  className?: string;
}) {
  const hay = text.toLowerCase();
  const brand = BRANDS.find((entry) => entry.test.test(hay));
  if (!brand) {
    return harness ? (
      <HarnessIcon harness={harness} className={className} />
    ) : null;
  }
  if (brand.image) {
    return (
      <img
        src={brand.image}
        alt=""
        aria-hidden
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }
  const Icon = brand.Icon!;
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center ${className}`}
    >
      <Icon size="100%" />
    </span>
  );
}

/** The model vendor's mark, falling back to the harness icon. */
export function ModelBrandIcon({
  model,
  className = "size-3.5",
}: {
  model: AgentModel;
  className?: string;
}) {
  return (
    <ModelBrandMark
      text={`${model.name} ${model.id} ${model.nativeId ?? ""}`}
      harness={model.harness}
      className={className}
    />
  );
}
