// @vitest-environment node
//
// U10: HTTP integration coverage for the board-scoped GET /tasks/board-workflows
// and the cross-board POST /tasks/:id/move-to-board route, exercised against a
// REAL TaskStore via createApiRoutes:
//   - two boards return their own columns + taskIds
//   - a null-boardId task falls back to the default board
//   - the team summary resolves agent names via the engine's AgentStore
//   - move-to-board re-homes the task, lands it in the target board's todo,
//     aborts the active session (releaseExecutionAgentBindings), and records the
//     move in the task log

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "@fusion/core";
import { createApiRoutes } from "../../routes.js";
import { request as REQUEST } from "../../test-request.js";

describe("GET /tasks/board-workflows (board-scoped)", () => {
  let store: TaskStore;
  let rootDir: string;
  let globalDir: string;
  let app: express.Express;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), "bw-route-root-"));
    globalDir = mkdtempSync(join(tmpdir(), "bw-route-global-"));
    store = new TaskStore(rootDir, globalDir, { inMemoryDb: true });
    await store.init();
    // Watch so the non-watching slim-list memo (store.ts ~L5279) is disabled and
    // the route reads a fresh task list right after we mutate it.
    await store.watch();

    app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));
  });

  afterEach(() => {
    store.close();
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
  });

  const get = (path: string) => REQUEST(app, "GET", path);
  const postTo = (a: express.Express, path: string, body?: unknown) =>
    REQUEST(a, "POST", path, body === undefined ? undefined : JSON.stringify(body), {
      "content-type": "application/json",
    });

  /** The v114 migration seeds a default "Board 1" (builtin:coding) on init. */
  function defaultBoardId(): string {
    const b = store.getBoardStore().getDefaultBoard();
    if (!b) throw new Error("expected a seeded default board");
    return b.id;
  }

  function homeTaskOnBoard(taskId: string, boardId: string): void {
    store.setTaskBoard(taskId, boardId);
  }

  it("returns two boards each with their own columns and taskIds; null-boardId homes on the default", async () => {
    const defId = defaultBoardId();
    const content = store.getBoardStore().createBoard({ name: "Content", workflowId: "builtin:coding", ordering: 1 });

    const a = await store.createTask({ description: "default-a" }); // null boardId → default
    const b = await store.createTask({ description: "content-b" });
    homeTaskOnBoard(b.id, content.id);

    const res = await get("/api/tasks/board-workflows");
    expect(res.status).toBe(200);
    const body = res.body as {
      boards: Array<{ id: string; name: string }>;
      boardPayloads: Record<string, { columns: Array<{ id: string }>; team: Record<string, unknown>; taskIds: string[] }>;
      defaultBoardId: string | null;
    };

    expect(body.defaultBoardId).toBe(defId);
    expect(body.boards.map((x) => x.id).sort()).toEqual([defId, content.id].sort());

    // Each board carries its own ordered columns.
    expect(body.boardPayloads[defId].columns.length).toBeGreaterThan(0);
    expect(body.boardPayloads[content.id].columns.length).toBeGreaterThan(0);

    // The null-boardId task homes on the default; the explicit one on Content.
    expect(body.boardPayloads[defId].taskIds).toContain(a.id);
    expect(body.boardPayloads[defId].taskIds).not.toContain(b.id);
    expect(body.boardPayloads[content.id].taskIds).toEqual([b.id]);
  });

  it("resolves the team summary to agent names via the engine's AgentStore", async () => {
    // A company-template board carries column-agent bindings; resolve their names
    // through a stub engine AgentStore injected as `options.engine`.
    const { COMPANY_BOARD_TEMPLATE_IR } = await import("@fusion/core");
    // Stamp a binding onto the company template's first role column.
    const ir = JSON.parse(JSON.stringify(COMPANY_BOARD_TEMPLATE_IR)) as {
      columns: Array<{ id: string; role?: string; agent?: { agentId: string; mode: string } }>;
    };
    const roleCol = ir.columns.find((c) => c.role);
    if (!roleCol) throw new Error("expected a role column in the company template");
    roleCol.agent = { agentId: "agent-lead", mode: "defer" };

    const def = await store.createWorkflowDefinition({ name: "Company", ir: ir as never });
    const board = store.getBoardStore().createBoard({ name: "Company Board", workflowId: def.id, ordering: 2 });

    const agentStore = {
      async getAgent(id: string) {
        return id === "agent-lead" ? { id, name: "Ada Lead" } : null;
      },
    };
    const fakeEngine = {
      getTaskStore: () => store,
      getAgentStore: () => agentStore,
    };

    const engApp = express();
    engApp.use(express.json());
    engApp.use("/api", createApiRoutes(store, { engine: fakeEngine as never }));

    const res = await REQUEST(engApp, "GET", "/api/tasks/board-workflows");
    expect(res.status).toBe(200);
    const body = res.body as {
      boardPayloads: Record<string, { team: Record<string, { agentId: string; agentName: string }> }>;
    };
    const team = body.boardPayloads[board.id].team;
    expect(team[roleCol.id]).toEqual({ agentId: "agent-lead", agentName: "Ada Lead" });
  });

  it("move-to-board re-homes the task, lands it in the target todo, aborts the session, and logs the move", async () => {
    const defId = defaultBoardId();
    const content = store.getBoardStore().createBoard({ name: "Content", workflowId: "builtin:coding", ordering: 1 });

    const task = await store.createTask({ description: "movable" });
    // It starts on the default board (null boardId resolves there).

    // Spy AgentStore so we can assert the session abort path runs.
    let listAgentsCalled = false;
    const agentStore = {
      async listAgents() {
        listAgentsCalled = true;
        return [] as Array<{ id: string; taskId?: string }>;
      },
      async syncExecutionTaskLink() {},
      async deleteAgent() {},
      async getAgent() {
        return null;
      },
    };
    const fakeEngine = { getTaskStore: () => store, getAgentStore: () => agentStore };

    const engApp = express();
    engApp.use(express.json());
    engApp.use("/api", createApiRoutes(store, { engine: fakeEngine as never }));

    const res = await postTo(engApp, `/api/tasks/${task.id}/move-to-board`, { boardId: content.id });
    expect(res.status).toBe(200);

    // Re-homed onto the target board, in its todo.
    expect(store.getTaskBoardId(task.id)).toBe(content.id);
    const moved = await store.getTask(task.id);
    expect(moved.column).toBe("todo");

    // Session abort ran (listAgents consulted).
    expect(listAgentsCalled).toBe(true);

    // The move is recorded in the task log.
    const full = await store.getTask(task.id);
    const logText = JSON.stringify(full.log ?? []);
    expect(logText).toContain("moved to board");

    // Moving to a board it already lives on is a no-op (still resolves 200).
    const noop = await postTo(engApp, `/api/tasks/${task.id}/move-to-board`, { boardId: content.id });
    expect(noop.status).toBe(200);

    // A missing board → 404, and the message names the BOARD (not the task) so
    // the board-not-found branch is honestly differentiated from task-not-found.
    const missing = await postTo(engApp, `/api/tasks/${task.id}/move-to-board`, { boardId: "gone" });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatch(/Board/i);
    expect(missing.body.error).not.toMatch(/Task/i);

    // A missing task → 404, and the message names the TASK.
    const missingTask = await postTo(engApp, `/api/tasks/does-not-exist/move-to-board`, { boardId: content.id });
    expect(missingTask.status).toBe(404);
    expect(missingTask.body.error).toMatch(/Task/i);

    // Missing boardId → 400.
    const bad = await postTo(engApp, `/api/tasks/${task.id}/move-to-board`, {});
    expect(bad.status).toBe(400);
  });
});
