import { describe, expect, it } from "vitest";
import {
  addReviewComment,
  canSubmitReview,
  emptyReviewDraft,
  prApproveAvailability,
  prEventDelta,
  prMergeAvailability,
  removeReviewComment,
  reviewCommentCount,
  updateReviewComment,
  type PrReviewComment,
} from "./prReview";
import type { GithubPrDetails } from "./githubTasks";

function details(overrides: Partial<GithubPrDetails> = {}): GithubPrDetails {
  return {
    body: "",
    author: "me",
    baseRefName: "main",
    headRefName: "feat/x",
    reviewDecision: "",
    id: "PR_1",
    state: "OPEN",
    draft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    labels: [],
    assignees: [],
    reviewRequests: [],
    ...overrides,
  };
}

describe("review draft", () => {
  it("adds, replaces, updates, and removes comments", () => {
    const input = { path: "a.ts", line: 3, side: "right" as const, body: "nit" };
    let draft = addReviewComment(emptyReviewDraft(), input);
    draft = addReviewComment(draft, { ...input, body: "nit 2" });
    expect(reviewCommentCount(draft)).toBe(1);
    expect(draft.comments[0]?.body).toBe("nit 2");

    const id = draft.comments[0]!.id;
    draft = updateReviewComment(draft, id, "updated");
    expect(draft.comments[0]?.body).toBe("updated");

    draft = removeReviewComment(draft, id);
    expect(reviewCommentCount(draft)).toBe(0);
  });

  it("requires content except for approve", () => {
    const draft = emptyReviewDraft();
    expect(canSubmitReview(draft, "approve")).toBe(true);
    expect(canSubmitReview(draft, "comment")).toBe(false);
    expect(canSubmitReview(draft, "request-changes")).toBe(false);
    const withComment = addReviewComment(draft, {
      path: "a.ts",
      line: 1,
      side: "right",
      body: "x",
    });
    expect(canSubmitReview(withComment, "comment")).toBe(true);
    expect(canSubmitReview(withComment, "request-changes")).toBe(true);
  });
});

describe("gating", () => {
  it("blocks merge when closed, draft, conflicting, blocked, or unknown", () => {
    expect(prMergeAvailability(details()).enabled).toBe(true);
    expect(prMergeAvailability(details({ state: "MERGED" })).enabled).toBe(false);
    expect(prMergeAvailability(details({ draft: true })).enabled).toBe(false);
    expect(prMergeAvailability(details({ mergeable: "CONFLICTING" })).enabled).toBe(false);
    expect(prMergeAvailability(details({ mergeStateStatus: "BLOCKED" })).enabled).toBe(false);
    expect(prMergeAvailability(details({ mergeable: "UNKNOWN" })).enabled).toBe(false);
  });

  it("blocks approving your own pull request", () => {
    expect(prApproveAvailability(details({ author: "other" }), "me").enabled).toBe(true);
    const own = prApproveAvailability(details({ author: "me" }), "me");
    expect(own.enabled).toBe(false);
    expect(own.reason.length).toBeGreaterThan(0);
  });
});

describe("entity delta", () => {
  it("computes adds and removes", () => {
    expect(prEventDelta(["bug", "ui"], ["ui", "api"])).toEqual({
      add: ["api"],
      remove: ["bug"],
    });
  });
});
