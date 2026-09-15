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
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Color";
import Qwen from "@lobehub/icons/es/Qwen/components/Color";
import XAI from "@lobehub/icons/es/XAI/components/Mono";
import Zhipu from "@lobehub/icons/es/Zhipu/components/Color";
import type { AgentModel } from "../lib/models";
import { modelVendor } from "../lib/modelBrand";
import type { HarnessId } from "../lib/session";
import { HarnessIcon } from "./HarnessIcon";

type LobeIcon = ComponentType<{ size?: number | string; className?: string }>;

/**
 * Brand marks keyed by vendor. We deep-import the glyph components (colored
 * `Color` where a brand palette exists, monochrome `Mono` otherwise) so the
 * heavy Avatar/Combine wrappers and their `@lobehub/ui` peer stay out of the
 * bundle.
 */
const ICONS: Record<string, LobeIcon> = {
  deepseek: DeepSeek,
  openai: OpenAIMono,
  claude: Claude,
  gemini: Gemini,
  xai: XAI,
  zhipu: Zhipu,
  kimi: Kimi,
  qwen: Qwen,
  minimax: Minimax,
  mistral: Mistral,
  meta: Meta,
  perplexity: Perplexity,
  openrouter: OpenRouter,
  groq: Groq,
};


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
  const Icon = ICONS[modelVendor(text)?.id ?? ""];
  if (!Icon) {
    return harness ? (
      <HarnessIcon harness={harness} className={className} />
    ) : null;
  }
  return (
    <span
      aria-hidden
      data-model-brand
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
