/**
 * Board-scoped board payload assembly (U10, R4/R12/R13).
 *
 * Boards are the universal task container in every mode — the lane concept is
 * gone. This module assembles, for a project, the boards index (id/name/etc.)
 * plus a per-board payload carrying that board's columns (resolved from the
 * board's workflow IR), its team summary (column → staffed agent), and the ids
 * of the tasks homed on it. Tasks with `boardId = null` count as the default
 * board's tasks (the board whose workflow is `builtin:coding`).
 *
 * The payload is UNCONDITIONAL — every mode gets boards, with no
 * `isWorkflowColumnsEnabled` short-circuit. Company-model *semantics* (teams,
 * movement rules) still ride behind their own flags elsewhere; here the team
 * summary is simply empty when a board's columns carry no agent bindings.
 *
 * Served by a sibling endpoint (`GET /tasks/board-workflows`) rather than folded
 * into the `/tasks` list response, so the task payload stays byte-identical.
 */

import {
  isBuiltinWorkflowId,
  isLinearColumnChainIr,
  parseWorkflowIr,
  resolveColumnFlags,
  resolveColumnAgentForColumn,
  resolveWorkflowIrById,
  BUILTIN_CODING_WORKFLOW_IR,
  type Board,
  type TaskStore,
  type WorkflowIr,
  type WorkflowIrV2,
  type WorkflowFieldDefinition,
  // Wire types are single-sourced in core (board-wire-types.ts) and shared with
  // the dashboard client (which re-exports them from `@fusion/core`).
  type BoardColumn,
  type BoardTeamMember,
  type BoardPayload,
  type BoardSummary,
  type BoardWorkflowsPayload,
} from "@fusion/core";

/** Stable id of the built-in coding workflow — the default board's workflow. */
export const DEFAULT_BOARD_WORKFLOW_ID = "builtin:coding";

// Re-export the shared wire types so existing server-side imports of these names
// from this module keep resolving (the canonical definition lives in core).
export type {
  BoardColumn,
  BoardTeamMember,
  BoardPayload,
  BoardSummary,
  BoardWorkflowsPayload,
};

/** Resolve an agent id to a display name. Supplied by the route (which reaches
 *  the AgentStore through the engine). When absent or it returns nothing, the
 *  member is still recorded with the id echoed as the name. */
export type ResolveAgentName = (agentId: string) => string | undefined | Promise<string | undefined>;

function toV2(ir: WorkflowIr): WorkflowIrV2 | undefined {
  return ir.version === "v2" ? ir : undefined;
}

function describeColumns(ir: WorkflowIr): BoardColumn[] {
  const v2 = toV2(ir);
  if (!v2) return [];
  return v2.columns.map((col) => ({
    id: col.id,
    name: col.name,
    flags: resolveColumnFlags(col),
    ...(col.role ? { role: col.role } : {}),
    ...(col.locked ? { locked: true } : {}),
  }));
}

/** Resolve a board's workflow IR + display name. Built-in workflows resolve
 *  through the IR resolver; custom workflows fetch the definition once. Falls
 *  back to the built-in coding IR on any failure so a board never renders
 *  column-less. */
async function resolveBoardIr(
  store: Pick<TaskStore, "getWorkflowDefinition">,
  workflowId: string,
): Promise<WorkflowIr> {
  if (isBuiltinWorkflowId(workflowId)) {
    try {
      return await resolveWorkflowIrById(store, workflowId);
    } catch {
      return BUILTIN_CODING_WORKFLOW_IR;
    }
  }
  try {
    const def = await store.getWorkflowDefinition(workflowId);
    if (def) {
      return typeof def.ir === "string" ? parseWorkflowIr(def.ir) : def.ir;
    }
  } catch {
    // fall through
  }
  return BUILTIN_CODING_WORKFLOW_IR;
}

/** Resolve the team summary for a board's columns: for each column carrying a
 *  column-agent binding, record { agentId, agentName }. Columns without a
 *  binding are omitted, so a legacy/default board yields an empty team. */
async function describeTeam(
  ir: WorkflowIr,
  columns: BoardColumn[],
  resolveAgentName?: ResolveAgentName,
): Promise<Record<string, BoardTeamMember>> {
  const team: Record<string, BoardTeamMember> = {};
  for (const col of columns) {
    const binding = resolveColumnAgentForColumn(ir, col.id);
    if (!binding?.agentId) continue;
    let agentName = binding.agentId;
    if (resolveAgentName) {
      try {
        const resolved = await resolveAgentName(binding.agentId);
        if (resolved) agentName = resolved;
      } catch {
        // best-effort: keep the id as the name
      }
    }
    team[col.id] = { agentId: binding.agentId, agentName };
  }
  return team;
}

/** A minimal task shape the payload needs: id + its homing board. */
export interface BoardTaskRef {
  id: string;
  boardId?: string | null;
}

/**
 * Build the board-scoped payload for a project. Resolves the boards index, the
 * default board (workflow === `builtin:coding`, else lowest ordering), and a
 * per-board payload (columns, team, taskIds). Tasks whose `boardId` is null or
 * does not resolve to a known board are counted on the default board.
 *
 * Unconditional: every mode gets boards. Returns an empty index (and
 * `defaultBoardId: null`) only for a board-less project.
 */
export async function buildBoardWorkflowsPayload(
  store: Pick<TaskStore, "getWorkflowDefinition" | "getBoardStore">,
  tasks: BoardTaskRef[],
  resolveAgentName?: ResolveAgentName,
): Promise<BoardWorkflowsPayload> {
  const boardStore = store.getBoardStore();
  const boards: Board[] = boardStore.listBoards();
  const defaultBoard = boardStore.getDefaultBoard();
  const defaultBoardId = defaultBoard?.id ?? null;

  if (boards.length === 0) {
    return { boards: [], boardPayloads: {}, defaultBoardId };
  }

  const knownBoardIds = new Set(boards.map((b) => b.id));

  // Bucket task ids per board; null/unknown boardId falls back to the default.
  const taskIdsByBoard = new Map<string, string[]>();
  for (const board of boards) taskIdsByBoard.set(board.id, []);
  for (const task of tasks) {
    const home =
      task.boardId && knownBoardIds.has(task.boardId) ? task.boardId : defaultBoardId;
    if (home) taskIdsByBoard.get(home)?.push(task.id);
  }

  const boardSummaries: BoardSummary[] = boards.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description ?? "",
    requirePlanApproval: b.requirePlanApproval,
    lfgMode: b.lfgMode,
    ordering: b.ordering,
  }));

  // Resolve each board's IR + columns + team concurrently; the per-board work is
  // independent, so awaiting them sequentially needlessly serialized the I/O.
  const resolvedBoards = await Promise.all(
    boards.map(async (board) => {
      const ir = await resolveBoardIr(store, board.workflowId);
      const columns = describeColumns(ir);
      const team = await describeTeam(ir, columns, resolveAgentName);
      const fields = toV2(ir)?.fields;
      const payload: BoardPayload = {
        columns,
        team,
        taskIds: taskIdsByBoard.get(board.id) ?? [],
        linear: isLinearColumnChainIr(ir),
        ...(fields && fields.length > 0 ? { fields } : {}),
      };
      return [board.id, payload] as const;
    }),
  );

  const boardPayloads: Record<string, BoardPayload> = {};
  for (const [boardId, payload] of resolvedBoards) {
    boardPayloads[boardId] = payload;
  }

  return { boards: boardSummaries, boardPayloads, defaultBoardId };
}
