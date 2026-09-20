import { afterEach, describe, expect, it } from "vitest";
import { resetLocaleForTests, saveLocale } from "../../../i18n/locale";
import {
  responseLanguageDirective,
  withResponseLanguage,
} from "./promptLanguage";

afterEach(() => {
  resetLocaleForTests();
});

describe("promptLanguage", () => {
  it("defaults to the user's own language", () => {
    expect(responseLanguageDirective()).toBe("Respond in the user's language.");
  });

  it("asks for Brazilian Portuguese when the app is in pt-BR", () => {
    saveLocale("pt-BR");
    expect(responseLanguageDirective()).toContain("português do Brasil");
    expect(withResponseLanguage("Continue from where you left off.")).toContain(
      "português do Brasil",
    );
  });
});
