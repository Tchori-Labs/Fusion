import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TaskStore, TaskDetail, Settings } from "@fusion/core";
import { TriageProcessor } from "../triage.js";

const { mockReviewStep } = vi.hoisted(() => ({ mockReviewStep: vi.fn() }));

vi.mock("../reviewer.js", () => ({ reviewStep: mockReviewStep }));

vi.mock("@fusion/core", async (importOriginal) => {
  const { createEngineCoreMock } = await import("../test/mockCore.js");
  return createEngineCoreMock(() => importOriginal<typeof import("@fusion/core")>(), {
    resolveAgentPrompt: vi.fn().mockReturnValue(null),
  });
});

function createMockStore(overrides: Partial<TaskStore> = {}): TaskStore {
  return {
    getTask: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn(),
    mergeTask: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 10000,
      groupOverlappingFiles: false,
      autoMerge: true,
    } as Settings),
    updateSettings: vi.fn(),
    logEntry: vi.fn().mockResolvedValue(undefined),
    appendAgentLog: vi.fn().mockResolvedValue(undefined),
    getAgentLogs: vi.fn().mockResolvedValue([]),
    addSteeringComment: vi.fn(),
    parseDependenciesFromPrompt: vi.fn().mockResolvedValue([]),
    parseStepsFromPrompt: vi.fn().mockResolvedValue([]),
    parseFileScopeFromPrompt: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
    emit: vi.fn(),
    ...overrides,
  } as unknown as TaskStore;
}

const mockTaskDetail: TaskDetail = {
  id: "FN-5321",
  description: "Test task",
  column: "triage",
  dependencies: [],
  steps: [],
  currentStep: 0,
  log: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  prompt: "# Task\n",
  attachments: [],
  comments: [],
};

describe("triage fn_review_spec external integration evidence", () => {
  it("short-circuits to REVISE when evidence is incomplete", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "fusion-triage-ext-evidence-"));
    try {
      const taskId = "FN-5321";
      const promptPath = `.fusion/tasks/${taskId}/PROMPT.md`;
      await mkdir(join(rootDir, ".fusion", "tasks", taskId), { recursive: true });
      const fabricatedRepo = ["worktrunk", "worktrunk"].join("/");
      await writeFile(
        join(rootDir, promptPath),
        `## Mission\nAdd third-party external binary integration.\n## Steps\n- install and probe \`worktrunk\` from release URL https://github.com/${fabricatedRepo}/releases/latest/download/worktrunk.tar.gz\n`,
      );

      const store = createMockStore({ getTask: vi.fn().mockResolvedValue({ ...mockTaskDetail, id: taskId }) });
      const processor = new TriageProcessor(store, rootDir);
      const verdictRef = { current: null as any };
      const tool = (processor as any).createReviewSpecTool(
        taskId,
        promptPath,
        { current: null },
        { current: null },
        verdictRef,
        { current: "" },
        {},
        false,
      );

      const result = await tool.execute({});
      expect(String(result.content[0]?.text)).toContain("REVISE");
      expect(String(result.content[0]?.text)).toContain("External-integration evidence gaps");
      expect(verdictRef.current).toBe("REVISE");
      expect(mockReviewStep).not.toHaveBeenCalled();
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("calls reviewer when evidence is complete", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "fusion-triage-ext-evidence-ok-"));
    try {
      const taskId = "FN-5321";
      const promptPath = `.fusion/tasks/${taskId}/PROMPT.md`;
      await mkdir(join(rootDir, ".fusion", "tasks", taskId), { recursive: true });
      await writeFile(
        join(rootDir, promptPath),
        "## Mission\nAdd third-party external integration.\n## Context to Read First\n- https://github.com/max-sixty/worktrunk\n- https://worktrunk.dev/\n- WORKTRUNK_PINNED_RELEASE\n## Steps\n- probe and run `wt`\n- release URL: https://github.com/max-sixty/worktrunk/releases/latest/download/wt-linux-x64.tar.gz\n- source: upstream-pending-verification\n",
      );

      mockReviewStep.mockResolvedValueOnce({ verdict: "APPROVE", summary: "ok", review: "" });
      const store = createMockStore({ getTask: vi.fn().mockResolvedValue({ ...mockTaskDetail, id: taskId }) });
      const processor = new TriageProcessor(store, rootDir);
      const verdictRef = { current: null as any };
      const tool = (processor as any).createReviewSpecTool(
        taskId,
        promptPath,
        { current: null },
        { current: null },
        verdictRef,
        { current: "" },
        {},
        false,
      );

      const result = await tool.execute({});
      expect(result.content[0]?.text).toBe("APPROVE");
      expect(verdictRef.current).toBe("APPROVE");
      expect(mockReviewStep).toHaveBeenCalledTimes(1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
