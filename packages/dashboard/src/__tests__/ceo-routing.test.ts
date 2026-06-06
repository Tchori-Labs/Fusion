/**
 * CEO global-chat routing toolset (company-model U8).
 *
 * The end-to-end fn_task_create board-routing behavior (AE5, multi-board,
 * authorization, rename-resilience, unknown-board) is covered against the engine
 * tool layer in packages/engine. Here we cover the DASHBOARD wiring:
 *  - the CEO identity check (isCeoAgent)
 *  - the toolset built for a flag-on CEO session (fn_board_list + fn_task_create
 *    + read tools) and the routing system-prompt suffix
 *  - a routing failure persists a run-audit event (not stdout-only)
 *  - flag-off / non-CEO: the CEO toolset is absent (asserted via the same gating
 *    primitives the ChatManager uses)
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore, COMPANY_BOARD_TEMPLATE_IR, isCompanyModelEnabled, type Agent } from "@fusion/core";
import { buildCeoChatToolset, isCeoAgent, CEO_ROUTING_SYSTEM_PROMPT } from "../ceo-chat-tools.js";

const dirs: string[] = [];

async function makeStore(): Promise<TaskStore> {
  const rootDir = await mkdtemp(join(tmpdir(), "ceo-dash-"));
  dirs.push(rootDir);
  const store = new TaskStore(rootDir, join(rootDir, ".fusion-global-settings"), { inMemoryDb: true });
  await store.init();
  return store;
}

async function makeCompanyBoard(store: TaskStore, name: string, description: string) {
  const def = await store.createWorkflowDefinition({
    name: `${name} wf`,
    description,
    ir: COMPANY_BOARD_TEMPLATE_IR,
  });
  return store.getBoardStore().createBoard({ name, description, workflowId: def.id });
}

const ceoAgent = { id: "AG-ceo", name: "CEO", metadata: { companyRole: "ceo" } } as unknown as Agent;
const plainAgent = { id: "AG-x", name: "Executor", metadata: { companyRole: "executor" } } as unknown as Agent;

afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("isCeoAgent", () => {
  it("recognizes the seeded CEO marker and rejects everything else", () => {
    expect(isCeoAgent(ceoAgent)).toBe(true);
    expect(isCeoAgent(plainAgent)).toBe(false);
    expect(isCeoAgent(null)).toBe(false);
    expect(isCeoAgent(undefined)).toBe(false);
    expect(isCeoAgent({ id: "x", name: "x" } as unknown as Agent)).toBe(false);
  });
});

describe("buildCeoChatToolset", () => {
  it("includes fn_board_list, fn_task_create, and the read tools + routing prompt", async () => {
    const store = await makeStore();
    try {
      const { tools, systemPromptSuffix } = buildCeoChatToolset({
        taskStore: store,
        ceoAgentId: ceoAgent.id,
        auditRunId: "chat:s1:1",
      });
      const names = tools.map((t) => t.name);
      expect(names).toContain("fn_board_list");
      expect(names).toContain("fn_task_create");
      expect(names).toContain("fn_task_list");
      expect(names).toContain("fn_task_get");
      expect(systemPromptSuffix).toBe(CEO_ROUTING_SYSTEM_PROMPT);
      expect(systemPromptSuffix).toMatch(/clarifying/i);
      expect(systemPromptSuffix).toMatch(/exactly ONE board/i);
    } finally {
      store.close();
    }
  });

  it("AE5: the CEO fn_task_create routes to the board's todo with the stored id stamped", async () => {
    const store = await makeStore();
    try {
      const board = await makeCompanyBoard(store, "Content", "blog and docs");
      const { tools } = buildCeoChatToolset({ taskStore: store, ceoAgentId: ceoAgent.id, auditRunId: "chat:s1:1" });
      const create = tools.find((t) => t.name === "fn_task_create")!;
      const result = await create.execute("c", { description: "write a launch post", board_id: board.id } as never);
      expect((result as { isError?: boolean }).isError).toBeFalsy();
      const taskId = (result.details as { taskId: string }).taskId;
      const task = await store.getTask(taskId);
      expect(task.boardId).toBe(board.id);
      expect(task.column).toBe("todo");
    } finally {
      store.close();
    }
  });

  it("fn_board_list returns boards with names + descriptions", async () => {
    const store = await makeStore();
    try {
      await makeCompanyBoard(store, "Engineering", "ships features");
      const { tools } = buildCeoChatToolset({ taskStore: store, ceoAgentId: ceoAgent.id, auditRunId: "chat:s1:1" });
      const list = tools.find((t) => t.name === "fn_board_list")!;
      const result = await list.execute("c", {} as never);
      const boards = (result.details as { boards: Array<{ name: string; description: string }> }).boards;
      expect(boards.map((b) => b.name)).toContain("Engineering");
      const eng = boards.find((b) => b.name === "Engineering")!;
      expect(eng.description).toBe("ships features");
    } finally {
      store.close();
    }
  });

  it("a routing failure (unknown board) persists a run-audit event — not stdout-only", async () => {
    const store = await makeStore();
    try {
      const { tools } = buildCeoChatToolset({ taskStore: store, ceoAgentId: ceoAgent.id, auditRunId: "chat:s9:3" });
      const create = tools.find((t) => t.name === "fn_task_create")!;
      const result = await create.execute("c", { description: "lost", board_id: "no-such-board" } as never);
      expect((result as { isError?: boolean }).isError).toBe(true);

      const events = store.getRunAuditEvents({ runId: "chat:s9:3" });
      expect(events.length).toBeGreaterThanOrEqual(1);
      const failure = events.find((e) => e.mutationType === "task:create-routing-failure");
      expect(failure).toBeDefined();
      expect(failure!.agentId).toBe(ceoAgent.id);
      expect(failure!.target).toBe("no-such-board");
      expect((failure!.metadata as { code?: string }).code).toBe("unknown-board");
    } finally {
      store.close();
    }
  });
});

describe("flag/identity gating (mirrors ChatManager.sendMessage decision)", () => {
  it("flag OFF → company model disabled, so the ChatManager skips the CEO toolset", async () => {
    const store = await makeStore();
    try {
      const settings = await store.getSettings();
      expect(isCompanyModelEnabled(settings)).toBe(false); // default off
      // ChatManager only builds the CEO toolset when isCeoAgent && companyModelOn.
      const wouldBuild = isCeoAgent(ceoAgent) && isCompanyModelEnabled(settings);
      expect(wouldBuild).toBe(false);
    } finally {
      store.close();
    }
  });

  it("flag ON but non-CEO session → ChatManager skips the CEO toolset", async () => {
    const store = await makeStore();
    try {
      await store.updateGlobalSettings({ experimentalFeatures: { companyModel: true } } as never);
      const settings = await store.getSettings();
      expect(isCompanyModelEnabled(settings)).toBe(true);
      const wouldBuild = isCeoAgent(plainAgent) && isCompanyModelEnabled(settings);
      expect(wouldBuild).toBe(false);
    } finally {
      store.close();
    }
  });

  it("flag ON + CEO session → ChatManager builds the CEO toolset", async () => {
    const store = await makeStore();
    try {
      await store.updateGlobalSettings({ experimentalFeatures: { companyModel: true } } as never);
      const settings = await store.getSettings();
      const wouldBuild = isCeoAgent(ceoAgent) && isCompanyModelEnabled(settings);
      expect(wouldBuild).toBe(true);
    } finally {
      store.close();
    }
  });
});
