// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  newProviderAccount,
  saveProviderAccount,
  selectProviderAccount,
} from "../lib/providerAccounts";
import { providerChipAccountSuffix } from "./ProviderAccountControls";

beforeEach(() => {
  localStorage.clear();
});

describe("provider chip account suffix", () => {
  it("hides the name when only the default account exists", () => {
    expect(providerChipAccountSuffix("codex", "/repo")).toBeNull();
  });

  it("shows the selected named account", () => {
    const work = newProviderAccount("codex", "Work");
    saveProviderAccount(work);
    selectProviderAccount("codex", "/repo", work.id);
    expect(providerChipAccountSuffix("codex", "/repo")).toBe("Work");
    expect(providerChipAccountSuffix("codex", "/other")).toBe("Default account");
  });
});
