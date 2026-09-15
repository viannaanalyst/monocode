import { useMemo, useState } from "react";
import { Check, Pencil, Search } from "./icons";
import { Popover } from "./Popover";
import { prEventDelta } from "../lib/prReview";
import type {
  GithubPrDetails,
  GithubPrEditInput,
  GithubRepoMeta,
} from "../lib/githubTasks";
import { t } from "../i18n";

type Field = "labels" | "assignees" | "reviewers";

function currentValues(
  details: GithubPrDetails,
  field: Field,
): string[] {
  if (field === "labels") return details.labels.map((label) => label.name);
  if (field === "assignees") return details.assignees.map((person) => person.login);
  return [...details.reviewRequests];
}

function optionsFor(meta: GithubRepoMeta, field: Field): string[] {
  if (field === "labels") return meta.labels.map((label) => label.name);
  if (field === "assignees") return [...meta.assignees];
  return [...meta.reviewers];
}

function toEditInput(field: Field, add: string[], remove: string[]): GithubPrEditInput {
  return {
    addLabels: field === "labels" ? add : [],
    removeLabels: field === "labels" ? remove : [],
    addAssignees: field === "assignees" ? add : [],
    removeAssignees: field === "assignees" ? remove : [],
    addReviewers: field === "reviewers" ? add : [],
    removeReviewers: field === "reviewers" ? remove : [],
  };
}

export function PrMetadataEditor({
  details,
  meta,
  busy,
  onApply,
}: {
  details: GithubPrDetails;
  meta: GithubRepoMeta;
  busy: string | null;
  onApply: (input: GithubPrEditInput) => void;
}) {
  const [open, setOpen] = useState<Field | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>([]);

  const active = open;
  const current = useMemo(
    () => (active ? currentValues(details, active) : []),
    [active, details],
  );
  const options = useMemo(
    () => (active ? optionsFor(meta, active) : []),
    [active, meta],
  );
  const filtered = options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const startEdit = (field: Field, element: HTMLElement) => {
    setDraft(currentValues(details, field));
    setQuery("");
    setAnchor(element);
    setOpen(field);
  };

  const apply = () => {
    if (!active) return;
    const { add, remove } = prEventDelta(current, draft);
    setOpen(null);
    if (add.length > 0 || remove.length > 0) {
      onApply(toEditInput(active, add, remove));
    }
  };

  const fields: { field: Field; label: string; values: string[] }[] = [
    { field: "labels", label: "Edit labels", values: currentValues(details, "labels") },
    { field: "assignees", label: "Edit assignees", values: currentValues(details, "assignees") },
    { field: "reviewers", label: "Edit reviewers", values: currentValues(details, "reviewers") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fields.map(({ field, label, values }) => (
        <button
          key={field}
          type="button"
          disabled={busy != null}
          onClick={(event) => startEdit(field, event.currentTarget)}
          title={t(label)}
          aria-label={t(label)}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-content/20 px-1.5 py-0.5 text-[11px] text-content/70 hover:bg-content/5 disabled:opacity-40"
        >
          <Pencil className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="max-w-52 truncate">
            {values.length > 0 ? values.join(", ") : t(field === "labels" ? "No labels" : "None")}
          </span>
        </button>
      ))}
      {open ? (
        <Popover
          anchor={anchor}
          side="bottom"
          align="start"
          gap={6}
          width={260}
          onDismiss={() => setOpen(null)}
          className="p-2"
        >
          <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-content/5 px-2">
            <Search className="size-3 shrink-0 text-content/40" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Filter…")}
              className="h-7 w-full bg-transparent text-[12px] text-content outline-none placeholder:text-content/35"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((option) => {
              const selected = draft.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setDraft((values) =>
                      selected
                        ? values.filter((value) => value !== option)
                        : [...values, option],
                    )
                  }
                  className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[12px] text-content/85 hover:bg-content/10"
                >
                  <span className="grid size-3.5 shrink-0 place-items-center">
                    {selected ? <Check className="size-3" strokeWidth={2} /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={apply}
            className="mt-1.5 h-7 w-full rounded-md bg-content text-[12px] font-medium text-background-base"
          >
            {t("Apply")}
          </button>
        </Popover>
      ) : null}
    </div>
  );
}
