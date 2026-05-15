import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockStore, mockedCreateFnAgent, mockedExecSync, mockedExistsSync, type Task } from "./merger-test-helpers.js";
import * as mergerModule from "../merger.js";

describe("FN-4646 aiMergeTask landedFiles capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedCreateFnAgent.mockResolvedValue({ session: { prompt: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() } } as any);
  });

  function makeStore(settings: Record<string, unknown> = {}) {
    const store = createMockStore(
      { id: "FN-4646", worktree: "/tmp/root/.worktrees/FN-4646" },
      [{ id: "FN-4646", worktree: "/tmp/root/.worktrees/FN-4646", column: "in-review" } as Task],
    );
    (store.getSettings as any).mockResolvedValue({ includeTaskIdInCommit: true, mergeConflictStrategy: "smart-prefer-main", ...settings });
    return store;
  }

  it("captures squash landedFiles and overwrites modifiedFiles", async () => {
    const store = makeStore();
    mockedExecSync.mockImplementation((cmd: any) => {
      const s = String(cmd);
      if (s.includes("rev-parse --verify")) return Buffer.from("abc123");
      if (s === "git rev-parse HEAD" || s.startsWith("git rev-parse HEAD ")) return "mergedsha123";
      if (s.includes("git log")) return "- feat: summary";
      if (s.includes("merge-base")) return Buffer.from("base123");
      if (s.includes("merge --squash")) return Buffer.from("");
      if (s.includes("diff --cached --quiet")) return "1";
      if (s.includes("diff --cached")) return "0";
      if (s.includes("show --shortstat --format= HEAD")) return "2 files changed, 3 insertions(+), 1 deletion(-)";
      if (s.includes("show --name-only --format= \"mergedsha123\"")) return "a.ts\nb.ts\n";
      if (s.includes("branch -d") || s.includes("branch -D") || s.includes("worktree remove")) return Buffer.from("");
      return Buffer.from("");
    });

    await mergerModule.aiMergeTask(store, "/tmp/root", "FN-4646");
    const detailsUpdate = (store.updateTask as any).mock.calls.find((call: any[]) => call[1]?.mergeDetails?.commitSha === "mergedsha123");
    expect(detailsUpdate?.[1].mergeDetails.landedFiles).toEqual(["a.ts", "b.ts"]);
    expect(detailsUpdate?.[1].modifiedFiles).toEqual(["a.ts", "b.ts"]);
  });

  it("captures rebase landedFiles from rebaseBaseSha..commitSha", async () => {
    const store = makeStore({ directMergeCommitStrategy: "always-rebase" });
    mockedExecSync.mockImplementation((cmd: any) => {
      const s = String(cmd);
      if (s.includes("rev-parse --verify")) return Buffer.from("abc123");
      if (s === "git rev-parse HEAD" || s.startsWith("git rev-parse HEAD ")) return "rebasesha123";
      if (s.includes("git log")) return "- feat: summary";
      if (s.includes("merge-base")) return Buffer.from("abc123");
      if (s.includes("rev-parse \"abc123\"")) return "rebasebase123";
      if (s.includes("rev-list --reverse \"rebasebase123..fusion/FN-4646\"")) return "";
      if (s.includes("status --porcelain")) return "";
      if (s.includes("rev-parse --git-path CHERRY_PICK_HEAD")) return ".git/CHERRY_PICK_HEAD";
      if (s.includes("rev-parse --git-path sequencer")) return ".git/sequencer";
      if (s.includes("diff --shortstat \"rebasebase123..HEAD\"")) return "2 files changed, 4 insertions(+), 1 deletion(-)";
      if (s.includes("diff --name-only \"rebasebase123..rebasesha123\"")) return "c.ts\nd.ts\n";
      if (s.includes("branch -d") || s.includes("branch -D") || s.includes("worktree remove")) return Buffer.from("");
      return Buffer.from("");
    });

    await mergerModule.aiMergeTask(store, "/tmp/root", "FN-4646");
    const detailsUpdate = (store.updateTask as any).mock.calls.find((call: any[]) => call[1]?.mergeDetails?.commitSha === "rebasesha123");
    expect(detailsUpdate?.[1].mergeDetails.rebaseBaseSha).toBe("rebasebase123");
    expect(detailsUpdate?.[1].mergeDetails.landedFiles).toEqual(["c.ts", "d.ts"]);
    expect(detailsUpdate?.[1].modifiedFiles).toEqual(["c.ts", "d.ts"]);
  });

  it("skips landedFiles capture for mergeWasEmpty", async () => {
    const store = makeStore();
    mockedExecSync.mockImplementation((cmd: any) => {
      const s = String(cmd);
      if (s.includes("rev-parse --verify")) return Buffer.from("abc123");
      if (s === "git rev-parse HEAD" || s.startsWith("git rev-parse HEAD ")) return "mergedsha123";
      if (s.includes("git log")) return "- feat: summary";
      if (s.includes("merge-base")) return Buffer.from("base123");
      if (s.includes("merge --squash")) return Buffer.from("");
      if (s.includes("diff --cached --quiet")) return "0";
      if (s.includes("show --shortstat --format= HEAD")) return "2 files changed, 3 insertions(+), 1 deletion(-)";
      if (s.includes("branch -d") || s.includes("branch -D") || s.includes("worktree remove")) return Buffer.from("");
      return Buffer.from("");
    });

    await mergerModule.aiMergeTask(store, "/tmp/root", "FN-4646");
    const detailsUpdate = (store.updateTask as any).mock.calls.find((call: any[]) => call[1]?.mergeDetails);
    expect(detailsUpdate?.[1].mergeDetails.commitSha).toBeUndefined();
    expect(detailsUpdate?.[1].mergeDetails.landedFiles).toBeUndefined();
    expect(detailsUpdate?.[1].modifiedFiles).toBeUndefined();
  });
});
