import type { ComponentPropsWithoutRef } from "react";
import { ChevronDown, FolderTree, GitBranch } from "../../../shared/ui/icons";

type Props = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className"
> & {
  label: string;
  loading?: boolean;
  worktree?: boolean;
};

/** Keep working-copy and branch modes visually identical in the composer. */
export function GitPickerTrigger({
  label,
  loading = false,
  worktree = false,
  ...props
}: Props) {
  const Icon = worktree ? FolderTree : GitBranch;
  return (
    <button
      type="button"
      {...props}
      className="flex h-6 min-w-0 max-w-64 items-center gap-1.5 rounded-full px-1.5 text-content/60 hover:bg-content/10 hover:text-content aria-expanded:bg-content/10 aria-expanded:text-content disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-content/50"
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
      <span className="relative truncate font-mono text-sm">
        {loading ? (
          <>
            {/* Reserve the same line box while the current branch loads. */}
            <span className="invisible">main</span>
            <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-current opacity-50" />
          </>
        ) : (
          label
        )}
      </span>
      {worktree && (
        <span className="shrink-0 text-2xs text-content/45">Worktree</span>
      )}
      <ChevronDown
        className="size-3.5 shrink-0 text-content/50"
        strokeWidth={1.75}
      />
    </button>
  );
}
