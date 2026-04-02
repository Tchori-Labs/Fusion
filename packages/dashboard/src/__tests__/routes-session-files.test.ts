import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../server.js";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import type { Task } from "@fusion/core";
import { EventEmitter } from "node:events";
import { get } from "../test-request.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

const mockExecSync = vi.mocked(childProcess.execSync);
const mockExistsSync = vi.mocked(fs.existsSync);

class MockStore extends EventEmitter {
  private tasks = new Map<string, Task>();

  getRootDir(): string {
    return process.cwd();
  }

  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async getTask(id: string): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) {
      const error = Object.assign(new Error("Task not found"), { code: "ENOENT" });
      throw error;
    }
    return task;
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getMissionStore() {
    return {
      listMissions: vi.fn().mockResolvedValue([]),
      getMission: vi.fn(),
      createMission: vi.fn(),
      updateMission: vi.fn(),
      deleteMission: vi.fn(),
      getMissionWithHierarchy: vi.fn(),
      listMilestones: vi.fn().mockResolvedValue([]),
      getMilestone: vi.fn(),
      addMilestone: vi.fn(),
      updateMilestone: vi.fn(),
      deleteMilestone: vi.fn(),
      reorderMilestones: vi.fn(),
      listSlices: vi.fn().mockResolvedValue([]),
      getSlice: vi.fn(),
      addSlice: vi.fn(),
      updateSlice: vi.fn(),
      deleteSlice: vi.fn(),
      reorderSlices: vi.fn(),
      activateSlice: vi.fn(),
      listFeatures: vi.fn().mockResolvedValue([]),
      getFeature: vi.fn(),
      addFeature: vi.fn(),
      updateFeature: vi.fn(),
      deleteFeature: vi.fn(),
      linkFeatureToTask: vi.fn(),
      unlinkFeatureFromTask: vi.fn(),
      getFeatureRollups: vi.fn().mockResolvedValue([]),
    };
  }
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-675",
    title: "Test task",
    description: "Test description",
    column: "in-progress",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    columnMovedAt: "2026-04-01T00:00:00.000Z",
    worktree: "/tmp/fn-675",
    ...overrides,
  };
}

async function requestSessionFiles(app: Parameters<typeof get>[0], taskId = "FN-675"): Promise<{ status: number; body: any }> {
  const response = await get(app, `/api/tasks/${taskId}/session-files`);
  return { status: response.status, body: response.body };
}

describe("GET /api/tasks/:id/session-files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns empty array when worktree is missing", async () => {
    const store = new MockStore();
    store.addTask(createTask({ worktree: undefined }));

    const app = createServer(store as any);
    const response = await requestSessionFiles(app);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);

  });
});
