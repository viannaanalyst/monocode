import type { GithubPrDetails } from "./githubTasks";

export type PrReviewEvent = "comment" | "approve" | "request-changes";

export type PrReviewComment = {
  id: string;
  path: string;
  line: number;
  side: "left" | "right";
  body: string;
};

export type PrReviewDraft = { comments: PrReviewComment[] };

export function emptyReviewDraft(): PrReviewDraft {
  return { comments: [] };
}

export function reviewCommentId(
  path: string,
  line: number,
  side: "left" | "right",
): string {
  return `${side}:${path.trim()}:${line}`;
}

export function addReviewComment(
  draft: PrReviewDraft,
  input: Omit<PrReviewComment, "id">,
): PrReviewDraft {
  const id = reviewCommentId(input.path, input.line, input.side);
  const comment: PrReviewComment = { id, ...input, body: input.body.trim() };
  return {
    comments: [...draft.comments.filter((entry) => entry.id !== id), comment],
  };
}

export function updateReviewComment(
  draft: PrReviewDraft,
  id: string,
  body: string,
): PrReviewDraft {
  return {
    comments: draft.comments.map((entry) =>
      entry.id === id ? { ...entry, body: body.trim() } : entry,
    ),
  };
}

export function removeReviewComment(
  draft: PrReviewDraft,
  id: string,
): PrReviewDraft {
  return { comments: draft.comments.filter((entry) => entry.id !== id) };
}

export function reviewCommentCount(draft: PrReviewDraft): number {
  return draft.comments.length;
}

export function canSubmitReview(
  draft: PrReviewDraft,
  event: PrReviewEvent,
): boolean {
  if (event === "approve") return true;
  return draft.comments.some((comment) => comment.body.trim().length > 0);
}

export function prMergeAvailability(
  details: GithubPrDetails,
): { enabled: boolean; reason: string } {
  if (details.state.trim().toUpperCase() !== "OPEN") {
    return { enabled: false, reason: "Pull request is not open" };
  }
  if (details.draft) {
    return { enabled: false, reason: "Draft pull requests cannot be merged" };
  }
  const mergeable = details.mergeable.trim().toUpperCase();
  if (mergeable === "CONFLICTING") {
    return { enabled: false, reason: "Resolve merge conflicts first" };
  }
  if (mergeable === "UNKNOWN") {
    return { enabled: false, reason: "Mergeability is still being computed" };
  }
  const status = details.mergeStateStatus.trim().toUpperCase();
  if (status === "BLOCKED") {
    return { enabled: false, reason: "Required checks or reviews are blocking" };
  }
  if (status === "DIRTY") {
    return { enabled: false, reason: "The branch has conflicts" };
  }
  return { enabled: true, reason: "" };
}

export function prApproveAvailability(
  details: GithubPrDetails,
  viewerLogin: string,
): { enabled: boolean; reason: string } {
  if (details.state.trim().toUpperCase() !== "OPEN") {
    return { enabled: false, reason: "Pull request is not open" };
  }
  const viewer = viewerLogin.trim().toLowerCase();
  if (viewer && details.author.trim().toLowerCase() === viewer) {
    return { enabled: false, reason: "You cannot approve your own pull request" };
  }
  return { enabled: true, reason: "" };
}

export function prEventDelta(
  current: readonly string[],
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const before = new Set(current.map((value) => value.trim()).filter(Boolean));
  const after = new Set(next.map((value) => value.trim()).filter(Boolean));
  return {
    add: [...after].filter((value) => !before.has(value)),
    remove: [...before].filter((value) => !after.has(value)),
  };
}

const drafts = new Map<string, PrReviewDraft>();

export function reviewDraftKey(cwd: string, number: number): string {
  return `${cwd.trim()}:${number}`;
}

export function peekReviewDraft(key: string): PrReviewDraft | null {
  return drafts.get(key) ?? null;
}

export function saveReviewDraft(key: string, draft: PrReviewDraft): void {
  drafts.set(key, draft);
}

export function clearReviewDraft(key: string): void {
  drafts.delete(key);
}
