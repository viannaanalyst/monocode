import { afterEach, describe, expect, it } from "vitest";
import { getLocale, resetLocaleForTests, saveLocale } from "./locale";
import { t } from "./t";

afterEach(() => {
  resetLocaleForTests();
});

describe("t", () => {
  it("returns the English key by default", () => {
    expect(t("New Tab")).toBe("New Tab");
    expect(t("{harness} finished", { harness: "Claude Code" })).toBe(
      "Claude Code finished",
    );
  });

  it("translates known Portuguese strings and falls back for unknown ones", () => {
    saveLocale("pt-BR");
    expect(getLocale()).toBe("pt-BR");
    expect(t("New Tab")).toBe("Nova aba");
    expect(t("{harness} finished", { harness: "Claude Code" })).toBe(
      "Claude Code terminou",
    );
    expect(t("Brand-new upstream string")).toBe("Brand-new upstream string");
    expect(t("Go to File (⌘P)")).toBe("Ir para arquivo (⌘P)");
    expect(t("New session (⌘T)")).toBe("Nova sessão (⌘T)");
  });
});
