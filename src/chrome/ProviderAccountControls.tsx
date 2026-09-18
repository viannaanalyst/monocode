import { useState, useSyncExternalStore } from "react";
import { t } from "../i18n";
import { loginHarness } from "../lib/harness/auth";
import {
  DEFAULT_PROVIDER_ACCOUNT_ID,
  getProviderAccountsSnapshot,
  newProviderAccount,
  providerAccounts,
  saveProviderAccount,
  selectedProviderAccountId,
  selectProviderAccount,
  subscribeProviderAccounts,
  supportsProviderAccounts,
  type ProviderAccount,
} from "../lib/providerAccounts";
import type { RateLimitProvider } from "../lib/rateLimits";
import { HARNESS_TITLE } from "../lib/session";

export function ProviderAccountControls({
  provider,
  project,
  onSelected,
}: {
  provider: RateLimitProvider;
  project?: string;
  onSelected?: (accountId: string) => void;
}) {
  useSyncExternalStore(
    subscribeProviderAccounts,
    getProviderAccountsSnapshot,
    getProviderAccountsSnapshot,
  );
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  if (!supportsProviderAccounts(provider)) return null;
  const accounts = providerAccounts(provider);
  const selectedId = selectedProviderAccountId(provider, project);

  const pick = (accountId: string) => {
    selectProviderAccount(provider, project, accountId);
    onSelected?.(accountId);
  };

  const add = async () => {
    const draft = newProviderAccount(provider, label);
    setBusy(true);
    setError(null);
    try {
      await loginHarness(provider, draft.id);
      saveProviderAccount(draft);
      pick(draft.id);
      setAdding(false);
      setLabel("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("Could not complete sign-in"),
      );
    } finally {
      setBusy(false);
    }
  };

  const rename = (account: ProviderAccount, nextLabel: string) => {
    saveProviderAccount({ ...account, label: nextLabel });
    setRenamingId(null);
  };

  return (
    <section className="mb-2.5 border-b border-content/[0.08] pb-2.5">
      <h3 className="px-1 pb-1 text-[10px] uppercase tracking-wide text-content/40">
        {t("Account in this project")}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {accounts.map((account) => {
          const selected = account.id === selectedId;
          const display = account.isDefault
            ? t("Default account")
            : account.label;
          return (
            <li key={account.id}>
              {renamingId === account.id && !account.isDefault ? (
                <form
                  className="flex gap-1 px-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = new FormData(event.currentTarget).get("label");
                    if (typeof value === "string") rename(account, value);
                  }}
                >
                  <input
                    name="label"
                    defaultValue={account.label}
                    maxLength={48}
                    className="min-w-0 flex-1 rounded bg-content/[0.06] px-1.5 py-1 text-xs"
                    aria-label={t("Account name")}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded px-1.5 text-[10px] text-content/70 hover:bg-content/10 hover:text-content"
                  >
                    {t("Rename")}
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs ${
                      selected
                        ? "bg-content/[0.08] text-content"
                        : "text-content/65 hover:bg-content/[0.05] hover:text-content"
                    }`}
                    aria-pressed={selected}
                    onClick={() => pick(account.id)}
                  >
                    <span aria-hidden>{selected ? "●" : "○"}</span>
                    <span className="min-w-0 truncate">{display}</span>
                  </button>
                  {account.isDefault ? null : (
                    <button
                      type="button"
                      className="shrink-0 rounded px-1.5 py-1 text-[10px] text-content/40 hover:bg-content/10 hover:text-content"
                      onClick={() => setRenamingId(account.id)}
                    >
                      {t("Rename")}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form
          className="mt-1.5 space-y-1.5 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <p className="text-[10px] text-content/45">
            {t("New {provider} account", { provider: HARNESS_TITLE[provider] })}
          </p>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={48}
            placeholder={t("Account name")}
            aria-label={t("Account name")}
            className="w-full rounded bg-content/[0.06] px-1.5 py-1 text-xs"
            autoFocus
            disabled={busy}
          />
          {error ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">{error}</p>
          ) : null}
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded px-1.5 py-1 text-[10px] text-content/50 hover:bg-content/10"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setError(null);
                setLabel("");
              }}
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              className="rounded px-1.5 py-1 text-[10px] text-content/80 hover:bg-content/10 hover:text-content disabled:opacity-50"
              disabled={busy || !label.trim()}
            >
              {busy ? t("Signing in…") : t("Continue")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="mt-1 w-full rounded px-1.5 py-1 text-left text-[10px] text-content/45 hover:bg-content/[0.05] hover:text-content/70"
          onClick={() => setAdding(true)}
        >
          + {t("Add account")}
        </button>
      )}
    </section>
  );
}

export function providerChipAccountSuffix(
  provider: RateLimitProvider,
  project?: string,
): string | null {
  if (!supportsProviderAccounts(provider)) return null;
  const accounts = providerAccounts(provider);
  if (accounts.length <= 1) return null;
  const selected = selectedProviderAccountId(provider, project);
  const account = accounts.find((entry) => entry.id === selected);
  const label =
    !account || account.id === DEFAULT_PROVIDER_ACCOUNT_ID
      ? t("Default account")
      : account.label;
  return label;
}
