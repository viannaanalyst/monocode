import { useMemo } from "react";
import type { GithubPrDiff } from "../lib/githubTasks";
import { mergePrDiff, parsePrPatch, type PrDiffFile } from "../lib/prDiff";
import { blocksFromLines, type UnifiedLine } from "../lib/unifiedDiff";
import { UnifiedDiffView, type UnifiedDiffFileModel } from "./UnifiedDiffView";
import { t } from "../i18n";


type Props = {
  diff: GithubPrDiff;
  /** When true, show the whole file (no fold rows). */
  fullFile?: boolean;
  onLineComment?: (comment: {
    filePath: string;
    line: UnifiedLine;
    body: string;
  }) => void;
};

export function InboxPrDiff({ diff, fullFile = false, onLineComment }: Props) {
  const files = useMemo(() => {
    const parsed = mergePrDiff(diff.files, parsePrPatch(diff.patch));
    const context = fullFile ? Number.POSITIVE_INFINITY : undefined;
    return parsed.map((file) => toModel(file, diff.truncated, context));
  }, [diff, fullFile]);

  return (
    <UnifiedDiffView
      files={files}
      truncated={diff.truncated}
      totals={{ additions: diff.additions, deletions: diff.deletions }}
      fill={false}
      fileLayout="cards"
      initialExpansion="first"
      onLineComment={onLineComment}
    />
  );
}

function toModel(
  file: PrDiffFile,
  truncated: boolean,
  context?: number,
): UnifiedDiffFileModel {
  const lines = file.lines.map(toUnifiedLine);
  return {
    id: file.path,
    path: file.path,
    label:
      file.status === "renamed" && file.previousPath
        ? `${file.previousPath} → ${file.path}`
        : file.path,
    binary: file.binary,
    emptyMessage:
      !file.binary && file.lines.length === 0
        ? truncated
          ? "Patch unavailable because this change is too large" : t("No textual diff")
        : undefined,
    additions: file.additions,
    deletions: file.deletions,
    blocks: blocksFromLines(lines, context),
  };
}

function toUnifiedLine(line: PrDiffFile["lines"][number]): UnifiedLine {
  return {
    kind: line.kind,
    text: line.text,
    oldNumber: line.oldNumber,
    newNumber: line.newNumber,
  };
}
