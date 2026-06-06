import { describe, it, expect } from "vitest";
import { buildBoardWorkflowsPayload, DEFAULT_BOARD_WORKFLOW_ID } from "../board-workflows.js";
import type { Board, WorkflowDefinition } from "@fusion/core";
import { parseWorkflowIr } from "@fusion/core";

// A minimal custom v2 workflow with an intake + complete column, staffing the
// intake column with an agent so the team summary resolves.
const CUSTOM: WorkflowDefinition = {
  id: "wf-custom",
  name: "Custom Flow",
  description: "",
  ir: parseWorkflowIr({
    version: "v2",
    name: "Custom Flow",
    columns: [
      { id: "intake", name: "Intake", traits: [{ trait: "intake" }], agent: { agentId: "agent-1", mode: "defer" } },
      { id: "done", name: "Done", traits: [{ trait: "complete" }] },
    ],
    nodes: [
      { id: "start", kind: "start", column: "intake" },
      { id: "end", kind: "end", column: "done" },
    ],
    edges: [{ from: "start", to: "end" }],
  }),
  layout: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeBoard(over: Partial<Board>): Board {
  return {
    id: "b",
    projectId: "p",
    name: "Board",
    description: "",
    workflowId: DEFAULT_BOARD_WORKFLOW_ID,
    ordering: 0,
    requirePlanApproval: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeStore(opts: {
  boards: Board[];
  defaultBoardId: string | null;
  defs?: Record<string, WorkflowDefinition>;
}) {
  return {
    async getWorkflowDefinition(id: string) {
      return opts.defs?.[id];
    },
    getBoardStore() {
      return {
        listBoards: () => opts.boards,
        getBoard: (id: string) => opts.boards.find((b) => b.id === id),
        getDefaultBoard: () =>
          opts.boards.find((b) => b.id === opts.defaultBoardId) ?? undefined,
      };
    },
  };
}

describe("buildBoardWorkflowsPayload (board-scoped)", () => {
  it("returns an empty index and null defaultBoardId for a board-less project", async () => {
    const store = makeStore({ boards: [], defaultBoardId: null });
    const payload = await buildBoardWorkflowsPayload(store as never, [{ id: "FN-1", boardId: null }]);
    expect(payload.boards).toEqual([]);
    expect(payload.boardPayloads).toEqual({});
    expect(payload.defaultBoardId).toBeNull();
  });

  it("returns two boards each with their own columns and taskIds", async () => {
    const def = makeBoard({ id: "b-default", name: "Default", workflowId: DEFAULT_BOARD_WORKFLOW_ID });
    const custom = makeBoard({ id: "b-custom", name: "Content", workflowId: "wf-custom", ordering: 1 });
    const store = makeStore({
      boards: [def, custom],
      defaultBoardId: "b-default",
      defs: { "wf-custom": CUSTOM },
    });

    const payload = await buildBoardWorkflowsPayload(store as never, [
      { id: "FN-1", boardId: "b-default" },
      { id: "FN-2", boardId: "b-custom" },
      { id: "FN-3", boardId: "b-custom" },
    ]);

    expect(payload.defaultBoardId).toBe("b-default");
    expect(payload.boards.map((b) => b.id)).toEqual(["b-default", "b-custom"]);

    // Each board carries its own columns.
    const defaultCols = payload.boardPayloads["b-default"].columns.map((c) => c.id);
    expect(defaultCols).toEqual(["triage", "todo", "in-progress", "in-review", "done", "archived"]);
    const customCols = payload.boardPayloads["b-custom"].columns.map((c) => c.id);
    expect(customCols).toEqual(["intake", "done"]);

    // Each board owns its tasks.
    expect(payload.boardPayloads["b-default"].taskIds).toEqual(["FN-1"]);
    expect(payload.boardPayloads["b-custom"].taskIds).toEqual(["FN-2", "FN-3"]);
  });

  it("counts a null-boardId task on the default board", async () => {
    const def = makeBoard({ id: "b-default", name: "Default" });
    const custom = makeBoard({ id: "b-custom", name: "Content", workflowId: "wf-custom", ordering: 1 });
    const store = makeStore({
      boards: [def, custom],
      defaultBoardId: "b-default",
      defs: { "wf-custom": CUSTOM },
    });

    const payload = await buildBoardWorkflowsPayload(store as never, [
      { id: "FN-1", boardId: null },
      { id: "FN-2", boardId: undefined },
      { id: "FN-3", boardId: "b-custom" },
      // An unknown/dangling boardId also falls back to the default board.
      { id: "FN-4", boardId: "gone" },
    ]);

    expect(payload.boardPayloads["b-default"].taskIds.sort()).toEqual(["FN-1", "FN-2", "FN-4"]);
    expect(payload.boardPayloads["b-custom"].taskIds).toEqual(["FN-3"]);
  });

  it("resolves the team summary to agent names via the resolver", async () => {
    const custom = makeBoard({ id: "b-custom", name: "Content", workflowId: "wf-custom" });
    const store = makeStore({
      boards: [custom],
      defaultBoardId: "b-custom",
      defs: { "wf-custom": CUSTOM },
    });

    const resolveAgentName = (agentId: string) =>
      agentId === "agent-1" ? "Lead Agent" : undefined;

    const payload = await buildBoardWorkflowsPayload(
      store as never,
      [{ id: "FN-1", boardId: "b-custom" }],
      resolveAgentName,
    );

    const team = payload.boardPayloads["b-custom"].team;
    expect(team["intake"]).toEqual({ agentId: "agent-1", agentName: "Lead Agent" });
    // The done column carries no binding → omitted from the team summary.
    expect(team["done"]).toBeUndefined();
  });

  it("leaves the team empty when no column carries a binding", async () => {
    const def = makeBoard({ id: "b-default", name: "Default" });
    const store = makeStore({ boards: [def], defaultBoardId: "b-default" });
    const payload = await buildBoardWorkflowsPayload(store as never, [{ id: "FN-1", boardId: "b-default" }]);
    expect(payload.boardPayloads["b-default"].team).toEqual({});
  });
});
