import { getLocale } from "../../../i18n/locale";

/**
 * Synthetic prompts (handoff briefs, second opinions, automatic continuation)
 * are written in English. Without this directive the agent answers in English,
 * so every synthetic prompt ends with the language the user expects.
 */
export function responseLanguageDirective(): string {
  if (getLocale() === "pt-BR") {
    return "Responda em português do Brasil, mesmo que as instruções acima estejam em inglês.";
  }
  return "Respond in the user's language.";
}

export function withResponseLanguage(text: string): string {
  return `${text.trim()}\n\n${responseLanguageDirective()}`;
}
