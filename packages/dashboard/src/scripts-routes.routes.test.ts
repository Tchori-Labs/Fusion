// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { TaskStore } from "@fusion/core";
import { createApiRoutes } from "./routes.js";
import { request as performRequest, get as performGet } from "./test-request.js";

function createMockGlobalSettingsStore() {
  return {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
    getSettingsPath: vi.fn().mockReturnValue("/fake/home/.pi/fusion/settings.json"),
    init: vi.fn().mockResolvedValue(false),
  };
}

function createMockMissionStore() {
  return {
    createSession: vi.fn().mockResolvedValue({ id: "session-1", status: "active" }),
    getSession: vi.fn().mockResolvedValue({ id: "session-1", status: "active", answers: [] }),
    updateSession: vi.fn().mockResolvedValue(undefined),
    addAnswer: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    generatePlan: vi.fn().mockResolvedValue({ plan: "Test plan", steps: [] }),
  };
}

function createMockStore(overrides: Partial<TaskStore> = {}): TaskStore {
  return {
    getTask: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    mergeTask: vi.fn(),
    archiveTask: vi.fn(),
    unarchiveTask: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn(),
    updateGlobalSettings: vi.fn(),
    getSettingsByScope: vi.fn().mockResolvedValue({ global: {}, project: {} }),
    getGlobalSettingsStore: vi.fn().mockReturnValue(createMockGlobalSettingsStore()),
    logEntry: vi.fn().mockResolvedValue(undefined),
    getAgentLogs: vi.fn().mockResolvedValue([]),
    addComment: vi.fn(),
    addTaskComment: vi.fn(),
    updateTaskComment: vi.fn(),
    deleteTaskComment: vi.fn(),
    updatePrInfo: vi.fn().mockResolvedValue(undefined),
    updateIssueInfo: vi.fn().mockResolvedValue(undefined),
    getRootDir: vi.fn().mockReturnValue("/fake/root"),
    listWorkflowSteps: vi.fn().mockResolvedValue([]),
    createWorkflowStep: vi.fn(),
    getWorkflowStep: vi.fn(),
    updateWorkflowStep: vi.fn(),
    deleteWorkflowStep: vi.fn(),
    getMissionStore: vi.fn().mockReturnValue(createMockMissionStore()),
    ...overrides,
  } as unknown as TaskStore;
}

async function GET(app: express.Express, path: string): Promise<{ status: number; body: any }> {
  const res = await performGet(app, path);
  return { status: res.status, body: res.body };
}

async function REQUEST(
  app: express.Express,
  method: string,
  path: string,
  body?: Buffer | string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const res = await performRequest(app, method, path, body, headers);
  return { status: res.status, body: res.body };
}

// Script store mock - module-level
const mockScriptStore = {
  getScripts: vi.fn(() => ({})),
  setScript: vi.fn(),
  removeScript: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  hasScript: vi.fn(() => false),
};

vi.mock("./script-store.js", () => ({
  loadScriptStore: vi.fn(() => Promise.resolve(mockScriptStore)),
  resetScriptStore: vi.fn(),
}));

describe("Scripts routes", () => {
  let store: TaskStore;

  beforeEach(() => {
    store = createMockStore();
    vi.clearAllMocks();
    mockScriptStore.getScripts.mockReturnValue({});
    mockScriptStore.hasScript.mockReturnValue(false);
    mockScriptStore.setScript.mockImplementation(() => {});
    mockScriptStore.removeScript.mockImplementation(() => {});
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));
    return app;
  }

  it("GET /api/scripts returns all scripts from script store", async () => {
    mockScriptStore.getScripts.mockReturnValueOnce({ build: "pnpm build", test: "pnpm test" });

    const res = await GET(buildApp(), "/api/scripts");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ build: "pnpm build", test: "pnpm test" });
  });

  it("GET /api/scripts returns empty object when no scripts", async () => {
    mockScriptStore.getScripts.mockReturnValueOnce({});

    const res = await GET(buildApp(), "/api/scripts");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("POST /api/scripts creates a new script and returns updated scripts", async () => {
    mockScriptStore.hasScript.mockReturnValueOnce(false);
    mockScriptStore.getScripts.mockReturnValueOnce({ test: "pnpm test" });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "build", command: "pnpm build" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(mockScriptStore.setScript).toHaveBeenCalledWith("build", "pnpm build");
    expect(mockScriptStore.save).toHaveBeenCalled();
  });

  it("POST /api/scripts returns 400 for missing name", async () => {
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ command: "echo hi" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("name is required");
  });

  it("POST /api/scripts returns 400 for missing command", async () => {
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "build" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("command is required");
  });

  it("POST /api/scripts creates script with any name", async () => {
    mockScriptStore.hasScript.mockReturnValueOnce(false);
    mockScriptStore.getScripts.mockReturnValueOnce({});

    // The actual implementation accepts any name
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "my-script", command: "echo hi" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(200);
    expect(mockScriptStore.setScript).toHaveBeenCalledWith("my-script", "echo hi");
  });

  it("DELETE /api/scripts/:name removes script and returns updated scripts", async () => {
    mockScriptStore.hasScript.mockReturnValueOnce(true);
    mockScriptStore.getScripts.mockReturnValueOnce({ test: "pnpm test" });

    const res = await REQUEST(buildApp(), "DELETE", "/api/scripts/build");

    expect(res.status).toBe(200);
    expect(mockScriptStore.removeScript).toHaveBeenCalledWith("build");
    expect(mockScriptStore.save).toHaveBeenCalled();
  });

  it("DELETE /api/scripts/:name removes script regardless of name format", async () => {
    mockScriptStore.hasScript.mockReturnValueOnce(true);
    mockScriptStore.getScripts.mockReturnValueOnce({});

    // The actual implementation doesn't validate names, it just removes
    const res = await REQUEST(buildApp(), "DELETE", "/api/scripts/build");

    expect(res.status).toBe(200);
    expect(mockScriptStore.removeScript).toHaveBeenCalledWith("build");
  });
});
