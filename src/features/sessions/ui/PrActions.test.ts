import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GithubPrDetails } from "../../inbox/model/githubTasks";
import { PrActions, type PrMergeMethod } from "./PrActions";

function details(overrides: Partial<GithubPrDetails> = {}): GithubPrDetails {
  return {
    body: "",
    author: "other",
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

function render(value: GithubPrDetails, viewerLogin = "me") {
  return renderToStaticMarkup(
    createElement(PrActions, {
      details: value,
      viewerLogin,
      busy: null,
      onSubmitReview: () => {},
      onToggleState: () => {},
      onMerge: (_method: PrMergeMethod, _deleteBranch: boolean) => {},
    }),
  );
}

describe("PrActions", () => {
  it("renders merge and review actions for an open pull request", () => {
    const markup = render(details());
    expect(markup).toContain("Merge");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Request changes");
    expect(markup).toContain("Close pull request");
  });

  it("explains why merge is blocked", () => {
    const markup = render(details({ mergeStateStatus: "BLOCKED" }));
    expect(markup).toContain("Required checks or reviews are blocking");
  });

  it("disables approve on your own pull request", () => {
    const markup = render(details({ author: "me" }));
    expect(markup).toContain("You cannot approve your own pull request");
  });

  it("offers reopen on a closed pull request", () => {
    const markup = render(details({ state: "CLOSED" }));
    expect(markup).toContain("Reopen pull request");
    expect(markup).not.toContain("Close pull request");
  });

  it("does not offer reopen or close on a merged pull request", () => {
    const markup = render(details({ state: "MERGED" }));
    expect(markup).not.toContain("Reopen pull request");
    expect(markup).not.toContain("Close pull request");
  });
});
