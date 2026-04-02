import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const runTaskCreate = vi.fn();
const runTaskList = vi.fn();
const runTaskPlan = vi.fn();
const runTaskImportFromGitHub = vi.fn();
const runSettingsShow = vi.fn();
const runSettingsExport = vi.fn();
const runSettingsImport = vi.fn();
const runGitStatus = vi.fn();
const runGitFetch = vi.fn();
const runBackupList = vi.fn();
const runProjectList = vi.fn();
const runProjectAdd = vi.fn();
const runProjectRemove = vi.fn();
const runProjectShow = vi.fn();
const runProjectInfo = vi.fn();
const runProjectSetDefault = vi.fn();
const runProjectDetect = vi.fn();

vi.mock("../commands/dashboard.js", () => ({
  runDashboard: vi.fn(),
}));

vi.mock("../commands/task.js", () => ({
  runTaskCreate,
  runTaskList,
  runTaskMove: vi.fn(),
  runTaskMerge: vi.fn(),
  runTaskUpdate: vi.fn(),
  runTaskLog: vi.fn(),
  runTaskLogs: vi.fn(),
  runTaskShow: vi.fn(),
  runTaskAttach: vi.fn(),
  runTaskPause: vi.fn(),
  runTaskUnpause: vi.fn(),
  runTaskImportFromGitHub,
  runTaskImportGitHubInteractive: vi.fn(),
  runTaskDuplicate: vi.fn(),
  runTaskArchive: vi.fn(),
  runTaskUnarchive: vi.fn(),
  runTaskRefine: vi.fn(),
  runTaskPlan,
  runTaskDelete: vi.fn(),
  runTaskRetry: vi.fn(),
  runTaskComment: vi.fn(),
  runTaskComments: vi.fn(),
  runTaskSteer: vi.fn(),
  runTaskPrCreate: vi.fn(),
}));

vi.mock("../commands/settings.js", () => ({
  runSettingsShow,
  runSettingsSet: vi.fn(),
}));

vi.mock("../commands/settings-export.js", () => ({ runSettingsExport }));
vi.mock("../commands/settings-import.js", () => ({ runSettingsImport }));

vi.mock("../commands/git.js", () => ({
  runGitStatus,
  runGitFetch,
  runGitPull: vi.fn(),
  runGitPush: vi.fn(),
}));

vi.mock("../commands/backup.js", () => ({
  runBackupCreate: vi.fn(),
  runBackupList,
  runBackupRestore: vi.fn(),
  runBackupCleanup: vi.fn(),
}));

vi.mock("../commands/project.js", () => ({
  runProjectList,
  runProjectAdd,
  runProjectRemove,
  runProjectShow,
  runProjectInfo,
  runProjectSetDefault,
  runProjectDetect,
}));

describe("bin", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn> | undefined;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    originalArgv = process.argv;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(((code?: number | string | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);
  });

  afterEach(() => {
    process.argv = originalArgv;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  async function runBin(args: string[]) {
    process.argv = ["node", "bin", ...args];
    vi.resetModules();
    return import("../bin.ts");
  }

  it("routes task list with --project before subcommand", async () => {
    await runBin(["--project", "my-app", "task", "list"]);
    expect(runTaskList).toHaveBeenCalledWith("my-app");
  });

  it("preserves legacy task list behavior when project flag is absent", async () => {
    await runBin(["task", "list"]);
    expect(runTaskList).toHaveBeenCalledWith(undefined);
  });

  it("routes task import with short -P and preserves other flags", async () => {
    await runBin(["task", "import", "owner/repo", "-P", "my-app", "--limit", "10", "--labels", "bug,help-wanted"]);
    expect(runTaskImportFromGitHub).toHaveBeenCalledWith("owner/repo", { limit: 10, labels: ["bug", "help-wanted"] }, "my-app");
  });

  it("strips --project before parsing free-form task create arguments", async () => {
    await runBin(["task", "create", "Fix", "login", "--attach", "spec.md", "--project", "demo"]);
    expect(runTaskCreate).toHaveBeenCalledWith("Fix login", ["spec.md"], undefined, "demo");
  });

  it("strips --project before parsing free-form task plan arguments", async () => {
    await runBin(["task", "plan", "Fix", "auth", "--project", "demo", "--yes"]);
    expect(runTaskPlan).toHaveBeenCalledWith("Fix auth", true, "demo");
  });

  it("passes projectName to settings, git, and backup handlers", async () => {
    await runBin(["settings", "--project", "my-app"]);
    expect(runSettingsShow).toHaveBeenCalledWith("my-app");

    await runBin(["git", "status", "--project", "my-app"]);
    expect(runGitStatus).toHaveBeenCalledWith("my-app");

    await runBin(["backup", "--list", "--project", "my-app"]);
    expect(runBackupList).toHaveBeenCalledWith("my-app");
  });

  it("passes projectName through to settings export and import handlers", async () => {
    await runBin(["settings", "export", "--project", "demo", "--scope", "project"]);
    expect(runSettingsExport).toHaveBeenCalledWith({ scope: "project", output: undefined, projectName: "demo" });

    await runBin(["settings", "import", "settings.json", "--project", "demo", "--yes"]);
    expect(runSettingsImport).toHaveBeenCalledWith("settings.json", { scope: "both", merge: false, yes: true, projectName: "demo" });
  });

  it("passes projectName through to git fetch handler without leaking args", async () => {
    await runBin(["git", "fetch", "origin", "--project", "demo"]);
    expect(runGitFetch).toHaveBeenCalledWith("origin", "demo");
  });

  it("routes project subcommands and aliases", async () => {
    await runBin(["project", "list"]);
    await runBin(["project", "ls"]);
    expect(runProjectList).toHaveBeenCalledTimes(2);

    await runBin(["project", "add", "my-app", "/tmp/my-app", "--isolation", "child-process", "--force"]);
    expect(runProjectAdd).toHaveBeenCalledWith("my-app", "/tmp/my-app", { isolation: "child-process", force: true, interactive: false });

    await runBin(["project", "remove", "my-app", "--force"]);
    await runBin(["project", "rm", "my-app", "--force"]);
    expect(runProjectRemove).toHaveBeenCalledWith("my-app", { force: true });

    await runBin(["project", "show", "my-app"]);
    expect(runProjectShow).toHaveBeenCalledWith("my-app");

    await runBin(["project", "set-default", "my-app"]);
    await runBin(["project", "default", "my-app"]);
    expect(runProjectSetDefault).toHaveBeenCalledWith("my-app");

    await runBin(["project", "detect"]);
    expect(runProjectDetect).toHaveBeenCalled();
  });

  it("rejects unknown project subcommands", async () => {
    await expect(runBin(["project", "wat"])).rejects.toThrow("process.exit:1");
    expect(errorSpy).toHaveBeenCalledWith("Unknown subcommand: project wat");
  });

  it("rejects duplicate --project flags", async () => {
    await expect(runBin(["task", "list", "--project", "one", "-P", "two"]))
      .rejects.toThrow("Duplicate --project flag. Specify a project only once.");
  });

  it("rejects missing --project value", async () => {
    await expect(runBin(["task", "list", "--project"]))
      .rejects.toThrow("Usage: --project <name>");
  });

  it("shows help when --project is combined with global help", async () => {
    await expect(runBin(["--project", "demo", "--help"]))
      .rejects.toThrow("process.exit:0");

    const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(help).toContain("fn project list | ls");
    expect(runTaskList).not.toHaveBeenCalled();
  });

  it("prioritizes subcommand help after stripping --project", async () => {
    await expect(runBin(["task", "list", "--project", "demo", "-h"]))
      .rejects.toThrow("process.exit:0");

    const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(help).toContain("--project, -P <name>");
    expect(runTaskList).not.toHaveBeenCalled();
  });

  it("help output documents project commands, task comments, and project flag", async () => {
    await expect(runBin(["--help"]))
      .rejects.toThrow("process.exit:0");

    const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(help).toContain("fn project list | ls");
    expect(help).toContain("fn task comments <id>");
    expect(help).toContain("--project, -P <name>");
  });
});
