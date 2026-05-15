import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NativeWorktreeBackend,
  WorktrunkOperationError,
  WorktrunkWorktreeBackend,
  resolveWorktreeBackend,
} from "../worktree-backend.js";

const { execMock } = vi.hoisted(() => {
  const mock = vi.fn();
  (mock as any)[Symbol.for("nodejs.util.promisify.custom")] = mock;
  return { execMock: mock };
});

vi.mock("node:child_process", () => ({ exec: execMock }));
vi.mock("../branch-conflicts.js", () => ({
  inspectBranchConflict: vi.fn().mockResolvedValue({ kind: "stale" }),
}));

beforeEach(() => {
  execMock.mockReset();
});

describe("NativeWorktreeBackend", () => {
  it("creates worktree with expected command", async () => {
    execMock.mockResolvedValue({ stdout: "", stderr: "" });
    const backend = new NativeWorktreeBackend();

    const result = await backend.create({
      rootDir: "/repo",
      worktreePath: "/repo/.worktrees/fn-1",
      branch: "fusion/fn-1",
      startPoint: "main",
      taskId: "FN-1",
    });

    expect(result).toEqual({ path: "/repo/.worktrees/fn-1", branch: "fusion/fn-1" });
    expect(execMock).toHaveBeenCalledWith(
      'git worktree add -b "fusion/fn-1" "/repo/.worktrees/fn-1" "main"',
      expect.objectContaining({ cwd: "/repo", timeout: 120000, maxBuffer: 10485760 }),
    );
  });

  it("retries with sibling branch suffixes when rename enabled", async () => {
    execMock
      .mockRejectedValueOnce(new Error("branch exists"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const backend = new NativeWorktreeBackend();

    const result = await backend.create({
      rootDir: "/repo",
      worktreePath: "/repo/.worktrees/fn-1",
      branch: "fusion/fn-1",
      taskId: "FN-1",
      allowSiblingBranchRename: true,
    });

    expect(result).toEqual({ path: "/repo/.worktrees/fn-1", branch: "fusion/fn-1-2" });
    expect(execMock).toHaveBeenNthCalledWith(
      2,
      'git worktree add -b "fusion/fn-1-2" "/repo/.worktrees/fn-1"',
      expect.objectContaining({ cwd: "/repo" }),
    );
  });

  it("removes worktree with force command", async () => {
    execMock.mockResolvedValue({ stdout: "", stderr: "" });
    const backend = new NativeWorktreeBackend();

    await backend.remove({ rootDir: "/repo", worktreePath: "/repo/.worktrees/fn-1", taskId: "FN-1" });

    expect(execMock).toHaveBeenCalledWith(
      'git worktree remove --force "/repo/.worktrees/fn-1"',
      expect.objectContaining({ cwd: "/repo", timeout: 60000, maxBuffer: 10485760 }),
    );
  });
});

describe("WorktrunkOperationError", () => {
  it("preserves operation, stderr, exitCode, and code", () => {
    const error = new WorktrunkOperationError({
      operation: "create",
      stderr: "failure",
      exitCode: 2,
      code: "worktrunk_operation_failed",
    });

    expect(error.name).toBe("WorktrunkOperationError");
    expect(error.operation).toBe("create");
    expect(error.stderr).toBe("failure");
    expect(error.exitCode).toBe(2);
    expect(error.code).toBe("worktrunk_operation_failed");
  });
});

describe("resolveWorktreeBackend", () => {
  it("defaults to native when worktrunk undefined", () => {
    expect(resolveWorktreeBackend({}).kind).toBe("native");
  });

  it("uses native when enabled=false", () => {
    expect(resolveWorktreeBackend({ worktrunk: { enabled: false } as any }).kind).toBe("native");
  });

  it("uses worktrunk when enabled=true and binaryPath present", () => {
    expect(resolveWorktreeBackend({ worktrunk: { enabled: true, binaryPath: "worktrunk" } as any }).kind).toBe("worktrunk");
  });

  it("uses worktrunk when enabled=true and binaryPath missing", async () => {
    const backend = resolveWorktreeBackend({ worktrunk: { enabled: true } as any });
    expect(backend.kind).toBe("worktrunk");
    await expect(
      backend.create({
        rootDir: "/repo",
        worktreePath: "/repo/.worktrees/fn-1",
        branch: "fusion/fn-1",
        taskId: "FN-1",
      }),
    ).rejects.toMatchObject({ code: "worktrunk_binary_missing" });
  });
});

describe("WorktrunkWorktreeBackend", () => {
  it("throws unsupported operation when configured", async () => {
    const backend = new WorktrunkWorktreeBackend({ binaryPath: "worktrunk" });
    await expect(
      backend.prune({ rootDir: "/repo", taskId: "FN-1" }),
    ).rejects.toMatchObject({ code: "worktrunk_unsupported_operation", operation: "prune" });
  });
});
