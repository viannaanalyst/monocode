import { useState, type FormEvent } from "react";
import { Modal } from "../../../shared/ui/Modal";
import type { LinkedWorkItem } from "../model/session";
import { parseGithubWorkItemUrl } from "../model/sessionWorkItem";
import { t } from "../../../i18n";

export function LinkSessionWorkItemDialog({
  initial,
  sessionTitle,
  onSave,
  onClose,
}: {
  initial?: LinkedWorkItem;
  sessionTitle: string;
  onSave: (item: LinkedWorkItem | undefined) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const item = parseGithubWorkItemUrl(url.trim());
    if (!item) {
      setError(t("Enter a valid GitHub issue or pull request URL."));
      return;
    }
    onSave(item);
  };

  return (
    <Modal
      title={initial ? t("Edit GitHub link") : t("Link GitHub issue or PR")}
      description={sessionTitle}
      size="sm"
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-content/80">
            {t("Issue or pull request URL")}
          </span>
          <input
            autoFocus
            type="url"
            value={url}
            aria-label={t("GitHub issue or pull request URL")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "linked-work-item-error" : undefined}
            placeholder="https://github.com/owner/repo/pull/123"
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError("");
            }}
            className={`h-9 rounded-md border bg-content/5 px-2.5 font-mono text-sm text-content outline-none placeholder:font-sans placeholder:text-content/30 focus:border-content/30 ${
              error ? "border-red-400/60" : "border-content/10"
            }`}
          />
          {error ? (
            <span
              id="linked-work-item-error"
              role="alert"
              className="text-2xs text-red-400"
            >
              {error}
            </span>
          ) : (
            <span className="text-2xs text-content/45">
              {t("Paste the full github.com URL. The linked item will appear on the session card.")}
            </span>
          )}
        </label>
        <div className="flex items-center justify-end gap-2">
          {initial ? (
            <button
              type="button"
              onClick={() => onSave(undefined)}
              className="mr-auto rounded-md px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-400/10"
            >
              {t("Remove link")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-content/70 hover:bg-content/8 hover:text-content"
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
          >
            {initial ? t("Update link") : t("Link")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
