import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GithubPrDetails, GithubRepoMeta } from "../lib/githubTasks";
import { PrMetadataEditor } from "./PrMetadataEditor";

const details: GithubPrDetails = {
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
  labels: [{ name: "bug", color: "ff0000" }],
  assignees: [{ login: "alice" }],
  reviewRequests: ["bob"],
};

const meta: GithubRepoMeta = {
  viewerLogin: "me",
  labels: [
    { name: "bug", color: "ff0000" },
    { name: "ui", color: "00ff00" },
  ],
  assignees: ["alice", "carol"],
  reviewers: ["bob", "dave"],
};

describe("PrMetadataEditor", () => {
  it("renders current labels, assignees, and reviewers", () => {
    const markup = renderToStaticMarkup(
      createElement(PrMetadataEditor, {
        details,
        meta,
        busy: null,
        onApply: () => {},
      }),
    );
    expect(markup).toContain("bug");
    expect(markup).toContain("alice");
    expect(markup).toContain("bob");
    expect(markup).toContain("Edit labels");
    expect(markup).toContain("Edit assignees");
    expect(markup).toContain("Edit reviewers");
  });
});
