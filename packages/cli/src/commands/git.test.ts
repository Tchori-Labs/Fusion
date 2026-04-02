import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("../project-context.js", () => ({
  resolveProject: vi.fn(),
}));

import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { resolveProject } from "../project-context.js";
import {
  isGitRepo,
  getGitStatus,
  getDirtyFileCount,
  isValidBranchName,
  fetchGitRemote,
  pullGitBranch,
  pushGitBranch,
  runGitStatus,
  runGitFetch,
  runGitPull,
  runGitPush,
} from "./git.js";

const mockExecSync = vi.mocked(execSync);
const mockCreateInterface = vi.mocked(createInterface);

describe("git commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    });
    vi.mocked(resolveProject).mockResolvedValue({
      projectId: "proj-1",
      projectName: "demo-project",
      projectPath: "/projects/demo",
      isRegistered: true,
      store: {} as any,
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("core helpers work", () => {
    mockExecSync.mockReturnValueOnce(".git");
    expect(isGitRepo()).toBe(true);
    expect(isValidBranchName("main")).toBe(true);
    expect(isValidBranchName("--bad")).toBe(false);
  });

  it("runGitStatus uses resolved project path", async () => {
    mockExecSync
      .mockReturnValueOnce(".git")
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("a1b2c3d\n")
      .mockReturnValueOnce(" M file.ts\n")
      .mockReturnValueOnce("0\t0\n")
      .mockReturnValueOnce(" M file.ts\n");

    await runGitStatus("demo-project");

    expect(resolveProject).toHaveBeenCalledWith("demo-project");
    expect(mockExecSync).toHaveBeenCalledWith("git status --porcelain", expect.objectContaining({ cwd: "/projects/demo" }));
  });

  it("runGitStatus without project uses shared resolution flow", async () => {
    mockExecSync
      .mockReturnValueOnce(".git")
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("a1b2c3d\n")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("0\t0\n");

    await runGitStatus();

    expect(resolveProject).toHaveBeenCalledWith(undefined);
    expect(mockExecSync).toHaveBeenCalledWith("git rev-parse --git-dir", expect.objectContaining({ cwd: "/projects/demo" }));
  });

  it("runGitStatus without project falls back to current working directory when resolution fails", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/local/project");
    vi.mocked(resolveProject).mockRejectedValueOnce(new Error("No fusion project found"));
    mockExecSync
      .mockReturnValueOnce(".git")
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("a1b2c3d\n")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("0\t0\n");

    await runGitStatus();

    expect(resolveProject).toHaveBeenCalledWith(undefined);
    expect(mockExecSync).toHaveBeenCalledWith("git rev-parse --git-dir", expect.objectContaining({ cwd: "/local/project" }));
    cwdSpy.mockRestore();
  });

  it("runGitFetch uses resolved project path", async () => {
    mockExecSync
      .mockReturnValueOnce(".git")
      .mockReturnValueOnce("Fetch completed");

    await runGitFetch("origin", "demo-project");

    expect(mockExecSync).toHaveBeenCalledWith("git fetch origin", expect.objectContaining({ cwd: "/projects/demo" }));
  });

  it("propagates project resolution errors for git commands", async () => {
    vi.mocked(resolveProject).mockRejectedValue(new Error("Project 'missing' not found. Run 'kb project list' to see registered projects."));

    await expect(runGitFetch("origin", "missing")).rejects.toThrow("Project 'missing' not found");
  });

  it("runGitPull uses resolved project path", async () => {
    const question = vi.fn().mockResolvedValue("y");
    mockCreateInterface.mockReturnValue({ question, close: vi.fn() } as any);
    mockExecSync
      .mockReturnValueOnce(".git")
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("a1b2c3d\n")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("0\t0\n")
      .mockReturnValueOnce("Already up to date.")
      .mockReturnValueOnce("Already up to date.");

    await runGitPull({ projectName: "demo-project" });

    expect(mockExecSync).toHaveBeenCalledWith("git pull", expect.objectContaining({ cwd: "/projects/demo" }));
  });

  it("runGitPush uses resolved project path", async () => {
    const question = vi.fn().mockResolvedValue("y");
    mockCreateInterface.mockReturnValue({ question, close: vi.fn() } as any);
    mockExecSync
      .mockReturnValueOnce(".git")
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("a1b2c3d\n")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("0\t0\n")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("");

    await runGitPush({ projectName: "demo-project" });

    expect(mockExecSync).toHaveBeenCalledWith("git push", expect.objectContaining({ cwd: "/projects/demo" }));
  });
});
