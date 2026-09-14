import { describe, expect, it, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  githubPrEdit,
  githubPrReview,
  githubWorkItemDetails,
} from "./githubTasks";

const detailsFixture = {
  body: "",
  author: "me",
  authorAvatarUrl: "",
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
};

describe("PR write wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (command: string) => {
      if (command === "git_github_work_item_details") return { ...detailsFixture };
      return undefined;
    });
  });

  it("passes review payload through unchanged", async () => {
    await githubPrReview("/tmp/repo", 7, "PR_1", "request-changes", "fix", [
      { path: "a.ts", line: 3, side: "right", body: "nit" },
    ]);
    expect(invoke).toHaveBeenCalledWith("git_github_pr_review", {
      cwd: "/tmp/repo",
      number: 7,
      prId: "PR_1",
      event: "request-changes",
      body: "fix",
      comments: [{ path: "a.ts", line: 3, side: "right", body: "nit" }],
    });
  });

  it("passes edit input through to the backend", async () => {
    await githubPrEdit("/tmp/repo", 7, {
      addLabels: ["bug"],
      removeLabels: [],
      addAssignees: [],
      removeAssignees: [],
      addReviewers: [],
      removeReviewers: [],
    });
    expect(invoke).toHaveBeenCalledWith("git_github_pr_edit", {
      cwd: "/tmp/repo",
      number: 7,
      input: {
        addLabels: ["bug"],
        removeLabels: [],
        addAssignees: [],
        removeAssignees: [],
        addReviewers: [],
        removeReviewers: [],
      },
    });
  });

  it("keeps new details fields", async () => {
    const details = await githubWorkItemDetails("/tmp/repo", "pr", 7);
    expect(details.id).toBe("PR_1");
    expect(details.mergeStateStatus).toBe("CLEAN");
  });
});
