// @vitest-environment node
//
// U12: HTTP coverage for the board-management routes against a REAL flag-on
// TaskStore via createApiRoutes:
//   - POST /boards creates a board and seeds its Lead/Executor/Reviewer (R8)
//   - POST /boards/:id/seed-team re-runs the seed (retry CTA, idempotent)
//   - GET /boards/:id/convert-preview previews the R17 conform mapping
//   - POST /boards/:id/convert-to-simple applies it and re-seeds the team
//   - POST /boards/:id/columns adds a custom column; an already-staffed agent
//     (AE3) and a missing name are rejected with structured 400s

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "@fusion/core";
import { createApiRoutes } from "../../routes.js";
import { request as REQUEST } from "../../test-request.js";
import { addWorkflowSseListener, type WorkflowSseEventType } from "../../sse.js";

describe("board-management routes (U12)", () => {
  let store: TaskStore;
  let rootDir: string;
  let globalDir: string;
  let app: express.Express;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), "boards-route-root-"));
    globalDir = mkdtempSync(join(tmpdir(), "boards-route-global-"));
    // Disk-backed so the route's fallback AgentStore shares one fusion.db.
    store = new TaskStore(rootDir, globalDir);
    await store.init();
    await store.updateGlobalSettings({
      experimentalFeatures: { companyModel: true, workflowColumns: true },
    });
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

  const post = (path: string, body?: unknown) =>
    REQUEST(app, "POST", path, body === undefined ? undefined : JSON.stringify(body), {
      "content-type": "application/json",
    });
  const get = (path: string) => REQUEST(app, "GET", path);
  const del = (path: string) => REQUEST(app, "DELETE", path);

  it("POST /boards creates a board and seeds its team (R8)", async () => {
    const res = await post("/api/boards", { name: "Docs", description: "Documentation work" });
    expect(res.status).toBe(201);
    expect(res.body.board.name).toBe("Docs");
    expect(res.body.seeded).toBe(true);

    // The board is re-pointed at a board-owned workflow staffing its role columns.
    const boardId = res.body.board.id as string;
    const bw = await get("/api/tasks/board-workflows");
    const team = bw.body.boardPayloads[boardId]?.team;
    expect(team.todo).toBeTruthy();
    expect(team["in-progress"]).toBeTruthy();
    expect(team["in-review"]).toBeTruthy();
  });

  it("POST /boards/:id/seed-team re-runs the seed idempotently", async () => {
    const created = await post("/api/boards", { name: "Backend" });
    const boardId = created.body.board.id as string;
    const before = await get("/api/tasks/board-workflows");
    const teamBefore = before.body.boardPayloads[boardId].team;

    const res = await post(`/api/boards/${boardId}/seed-team`);
    expect(res.status).toBe(200);
    expect(res.body.seeded).toBe(true);

    const after = await get("/api/tasks/board-workflows");
    // Same agent identities — re-seed does not churn the roster.
    expect(after.body.boardPayloads[boardId].team.todo.agentId).toBe(teamBefore.todo.agentId);
  });

  it("POST /boards/:id/columns adds a custom column with a new agent", async () => {
    const created = await post("/api/boards", { name: "Pipeline" });
    const boardId = created.body.board.id as string;

    const res = await post(`/api/boards/${boardId}/columns`, {
      name: "Deploy",
      placement: "after-review",
      agent: { create: { name: "Deployer" } },
    });
    expect(res.status).toBe(201);
    expect(res.body.columnId).toBe("deploy");
    expect(res.body.agentId).toBeTruthy();

    const bw = await get("/api/tasks/board-workflows");
    const columns = bw.body.boardPayloads[boardId].columns.map((c: { id: string }) => c.id);
    expect(columns).toContain("deploy");
    // After-review placement sits between in-review and done.
    expect(columns.indexOf("deploy")).toBeGreaterThan(columns.indexOf("in-review"));
    expect(columns.indexOf("deploy")).toBeLessThan(columns.indexOf("done"));
  });

  it("POST /boards/:id/columns rejects staffing an already-staffed agent (AE3)", async () => {
    const created = await post("/api/boards", { name: "Team-A" });
    const boardId = created.body.board.id as string;
    // The Lead agent is already staffed on the todo column. Reusing it for a
    // custom column violates one-agent-per-column in simple mode.
    const bw = await get("/api/tasks/board-workflows");
    const leadAgentId = bw.body.boardPayloads[boardId].team.todo.agentId as string;

    const res = await post(`/api/boards/${boardId}/columns`, {
      name: "Deploy",
      placement: "before-review",
      agent: { agentId: leadAgentId },
    });
    expect(res.status).toBe(400);
    expect(res.body.details?.reason).toBe("agent-multiple-columns");
  });

  it("POST /boards/:id/columns does not orphan an agent when the add is rejected", async () => {
    const created = await post("/api/boards", { name: "Team-Orphan" });
    const boardId = created.body.board.id as string;
    const bw = await get("/api/tasks/board-workflows");
    const leadAgentId = bw.body.boardPayloads[boardId].team.todo.agentId as string;

    const before = (await get("/api/agents")).body as Array<{ id: string }>;

    // A rejected add (AE3) must not persist a new unbound agent. Repeated retries
    // must not accumulate orphans either — the roster stays exactly the same.
    for (let i = 0; i < 3; i++) {
      const res = await post(`/api/boards/${boardId}/columns`, {
        name: "Deploy",
        placement: "before-review",
        agent: { agentId: leadAgentId },
      });
      expect(res.status).toBe(400);
    }

    const after = (await get("/api/agents")).body as Array<{ id: string }>;
    expect(after.map((a) => a.id).sort()).toEqual(before.map((a) => a.id).sort());
  });

  it("POST /boards/:id/columns disambiguates colliding column ids with a counter", async () => {
    const created = await post("/api/boards", { name: "Pipeline-Collisions" });
    const boardId = created.body.board.id as string;

    // First "Deploy" → deploy. Subsequent ones must become deploy-1, deploy-2, …
    // (a counter), not deploy-1-1-1 from repeatedly appending "-1".
    const expectedIds = ["deploy", "deploy-1", "deploy-2"];
    for (const expected of expectedIds) {
      const res = await post(`/api/boards/${boardId}/columns`, {
        name: "Deploy",
        placement: "after-review",
        agent: { create: { name: `Deployer-${expected}` } },
      });
      expect(res.status).toBe(201);
      expect(res.body.columnId).toBe(expected);
    }

    const bw = await get("/api/tasks/board-workflows");
    const ids = bw.body.boardPayloads[boardId].columns.map((c: { id: string }) => c.id);
    for (const expected of expectedIds) expect(ids).toContain(expected);
  });

  // U13: register the bundled CE plugin so the CE board type is offered/accepted.
  const installCePlugin = async () => {
    await store.getPluginStore().registerPlugin({
      manifest: {
        id: "fusion-plugin-compound-engineering",
        name: "Compound Engineering",
        version: "0.1.0",
        description: "test",
        author: "test",
      },
      path: "/tmp/ce-plugin/bundled.js",
    });
  };

  it("GET /boards/types omits Compound Engineering until the CE plugin is installed (U13)", async () => {
    const before = await get("/api/boards/types");
    expect(before.status).toBe(200);
    const idsBefore = (before.body.types as Array<{ id: string }>).map((t) => t.id);
    expect(idsBefore).toContain("standard");
    expect(idsBefore).not.toContain("compound-engineering");

    await installCePlugin();

    const after = await get("/api/boards/types");
    const idsAfter = (after.body.types as Array<{ id: string }>).map((t) => t.id);
    expect(idsAfter).toContain("compound-engineering");
    // Standard is still present and CE is never the default (standard leads).
    expect(idsAfter[0]).toBe("standard");
  });

  it("POST /boards rejects the CE board type when the plugin is not installed (U13)", async () => {
    const res = await post("/api/boards", { name: "CE", boardType: "compound-engineering" });
    expect(res.status).toBe(400);
    expect(String(res.body.error ?? res.body.message ?? "")).toMatch(/compound-engineering/);
  });

  it("POST /boards creates a CE board with the CE template + seeded team + plan approval on (U13, R20)", async () => {
    await installCePlugin();
    const res = await post("/api/boards", {
      name: "CE Dept",
      boardType: "compound-engineering",
      lfgMode: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.seeded).toBe(true);
    const board = res.body.board;
    // R20: plan approval defaults ON for CE boards; R22: explicit LFG toggle honored.
    expect(board.requirePlanApproval).toBe(true);
    expect(board.lfgMode).toBe(true);

    const boardId = board.id as string;
    const bw = await get("/api/tasks/board-workflows");
    const payload = bw.body.boardPayloads[boardId];
    const ids = payload.columns.map((c: { id: string }) => c.id);
    // The CE template columns are present (Compound between in-review and done).
    expect(ids).toContain("compound");
    expect(ids.indexOf("compound")).toBeGreaterThan(ids.indexOf("in-review"));
    expect(ids.indexOf("compound")).toBeLessThan(ids.indexOf("done"));
    // The team is seeded onto the role columns (engine bindings preserved alongside).
    expect(payload.team.todo).toBeTruthy();
    expect(payload.team["in-progress"]).toBeTruthy();
    expect(payload.team["in-review"]).toBeTruthy();

    // U13 sub-part C: the board's CE workflow actually COMPILES onto the linear
    // WorkflowStep engine (the template fix linearized the compound node) — board
    // creation persisted a board-owned workflow whose IR compiles, and a task can
    // enter the board's todo column. Prove the IR compiles and persists.
    const boardRow = store.getBoardStore().getBoard(boardId)!;
    const wf = await store.getWorkflowDefinition(boardRow.workflowId);
    expect(wf).toBeTruthy();
    const { compileWorkflowToSteps, validateLinearity } = await import("@fusion/core");
    expect(validateLinearity(wf!.ir)).toBeNull(); // compilable (no interpreter required)
    const steps = compileWorkflowToSteps(wf!.ir);
    // The compound post-merge step compiled in.
    expect(steps.some((s) => s.name === "compound" && s.phase === "post-merge")).toBe(true);

    // A task created on this board homes into the CE board's todo (the Lead column).
    const task = await store.createTask({ description: "ce e2e task" });
    await store.selectTaskWorkflowAndReconcile(task.id, boardRow.workflowId);
    await store.moveTask(task.id, "todo", { moveSource: "user" });
    const moved = await store.getTask(task.id);
    expect(moved.column).toBe("todo");
  });

  it("convert-preview then convert-to-simple conforms a custom-workflow board", async () => {
    // A board on a custom non-default workflow with an extra column.
    const def = await store.createWorkflowDefinition({
      name: "Legacy",
      ir: {
        version: "v2",
        name: "legacy",
        columns: [
          { id: "intake-col", name: "Backlog", traits: [{ trait: "intake" }] },
          { id: "build", name: "Build", traits: [{ trait: "wip" }] },
          { id: "deploy", name: "Deploy", traits: [] },
          { id: "qa", name: "QA", traits: [{ trait: "merge-blocker" }] },
          { id: "shipped", name: "Shipped", traits: [{ trait: "complete" }] },
        ],
        nodes: [
          { id: "start", kind: "start", column: "build" },
          { id: "end", kind: "end", column: "shipped" },
        ],
        edges: [{ from: "start", to: "end" }],
      },
    });
    const board = store.getBoardStore().createBoard({ name: "Legacy board", workflowId: def.id, ordering: 5 });

    const preview = await get(`/api/boards/${board.id}/convert-preview`);
    expect(preview.status).toBe(200);
    const previewMappings = preview.body.mappings as Array<{ fromColumnId: string; toColumnId: string | null; carried: boolean }>;
    expect(previewMappings.find((m) => m.fromColumnId === "build")?.toColumnId).toBe("in-progress");
    expect(previewMappings.find((m) => m.fromColumnId === "deploy")?.carried).toBe(true);

    const applied = await post(`/api/boards/${board.id}/convert-to-simple`);
    expect(applied.status).toBe(200);
    expect(applied.body.seeded).toBe(true);

    const bw = await get("/api/tasks/board-workflows");
    const payload = bw.body.boardPayloads[board.id];
    const ids = payload.columns.map((c: { id: string }) => c.id);
    // Conformed onto the company template (role columns present) + carried column.
    expect(ids).toContain("todo");
    expect(ids).toContain("in-progress");
    expect(ids).toContain("in-review");
    expect(ids).toContain("deploy");
    expect(payload.team.todo).toBeTruthy();
  });

  // ── DELETE /boards/:id (board:deleted) ─────────────────────────────────────

  it("DELETE /boards/:id re-homes the board's tasks to the default board, deletes it, and emits board:deleted", async () => {
    // The default board (builtin:coding) homes null-boardId tasks.
    const bwBefore = await get("/api/tasks/board-workflows");
    const defaultBoardId = bwBefore.body.defaultBoardId as string;
    expect(defaultBoardId).toBeTruthy();

    // A second board with a task homed on it.
    const created = await post("/api/boards", { name: "Disposable" });
    const boardId = created.body.board.id as string;
    const task = await store.createTask({ description: "homed on disposable board" });
    store.setTaskBoard(task.id, boardId);

    // Capture the board:deleted SSE emission.
    const events: Array<{ event: WorkflowSseEventType; payload: unknown }> = [];
    const dispose = addWorkflowSseListener((event, payload) => events.push({ event, payload }));

    const res = await del(`/api/boards/${boardId}`);
    dispose();

    expect(res.status).toBe(200);
    expect(res.body.deletedBoardId).toBe(boardId);
    expect(res.body.rehomedToBoardId).toBe(defaultBoardId);
    expect(res.body.rehomedTaskIds).toContain(task.id);

    // The task is re-homed to the default board (and landed in its Todo as a
    // system action).
    const moved = await store.getTask(task.id);
    expect(moved.boardId).toBe(defaultBoardId);
    expect(moved.column).toBe("todo");

    // The board row is gone.
    expect(store.getBoardStore().getBoard(boardId)).toBeUndefined();

    // board:deleted was emitted with the deleted id.
    const deleted = events.find((e) => e.event === "board:deleted");
    expect(deleted).toBeTruthy();
    expect((deleted!.payload as { id: string }).id).toBe(boardId);
  });

  it("DELETE /boards/:id refuses to delete the default board while it homes null-boardId tasks", async () => {
    const bw = await get("/api/tasks/board-workflows");
    const defaultBoardId = bw.body.defaultBoardId as string;

    // A task with boardId = null homes implicitly on the default board.
    await store.createTask({ description: "implicitly homed (null boardId)" });

    const res = await del(`/api/boards/${defaultBoardId}`);
    expect(res.status).toBe(400);
    expect(res.body.details?.reason).toBe("default-homes-null-tasks");
    // The default board still exists.
    expect(store.getBoardStore().getBoard(defaultBoardId)).toBeTruthy();
  });

  it("DELETE /boards/:id 404s for an unknown board", async () => {
    const res = await del("/api/boards/does-not-exist");
    expect(res.status).toBe(404);
  });
});
