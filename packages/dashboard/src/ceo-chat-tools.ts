/**
 * CEO global-chat routing toolset (company-model U8).
 *
 * When the company-model flag is on and the global-chat session runs under the
 * project CEO identity (the agent whose `metadata.companyRole === "ceo"`), the
 * chat agent gets a routing tool set instead of the generic coding tools:
 *
 *  - `fn_board_list`   — boards (id, name, description, column summary) to route to
 *  - `fn_task_create`  — CEO-aware: accepts `board_id`, homing the task on that
 *                        board's Todo column with the STORED board id stamped
 *  - `fn_task_list` / `fn_task_get` — read tools (duplicate-scan before routing)
 *
 * The boardId parameter is CEO-only: the engine tool rejects a non-CEO caller
 * supplying it (defense in depth — the chat layer only hands the CEO an
 * isCeo:true tool, but the authorization lives in the tool itself).
 *
 * A routing failure (authorization, unknown board, store rejection) is recorded
 * as a PERSISTED run-audit event via the supplied `taskStore.recordRunAuditEvent`
 * — never a stdout-only log (per the run-audit pattern).
 */

import type { Agent, AgentStore, TaskStore } from "@fusion/core";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  createTaskCreateTool,
  createBoardListTool,
  createBoardCreateTool,
  createTaskMoveBoardTool,
  createPlanApproveTool,
  createPlanRejectTool,
  createTaskAnswerInputTool,
  createTaskSendMessageTool,
  createBoardConvertSimpleTool,
  type CeoTaskRoutingOptions,
  type CeoToolGate,
} from "@fusion/engine";
import { createPlanningBoardTools } from "./planning-board-tools.js";

/**
 * The CEO routing policy appended to the CEO's chat system prompt. No
 * structured pick-list fallback, no expiry — pending routing context lives in
 * the chat session like any other conversation state (KTD).
 */
export const CEO_ROUTING_SYSTEM_PROMPT = [
  "You are the project CEO. The global chat is your single entry point: turn a user's request",
  "into a task homed on the right board's Todo queue.",
  "",
  "Routing policy:",
  "1. Call fn_board_list to see the available boards (id, name, description, columns).",
  "2. If exactly ONE board exists, route the request there directly — do NOT ask which board.",
  "3. If multiple boards exist and exactly one clearly matches the request (by name/description),",
  "   route there directly.",
  "4. If multiple boards plausibly match, or none clearly matches, ASK a concise clarifying",
  "   question naming the candidate boards and wait for the user's answer. Do not guess, do not",
  "   present a numbered pick-list with expiry — just continue the conversation until the target",
  "   board is resolved, then create the task.",
  "5. Create the task with fn_task_create(board_id=<the chosen board's id>, description=...).",
  "   The task lands in that board's Todo column where its Lead structures it.",
  "",
  "You do not execute work yourself — you only route it onto a board.",
].join("\n");

export interface CeoChatToolsetResult {
  /** The CEO routing tools to pass as customTools. */
  tools: ToolDefinition[];
  /** The routing policy text to append to the system prompt. */
  systemPromptSuffix: string;
}

/**
 * True when the chat session's agent is the project CEO (company-model U8).
 * Keyed off the stable seeded marker `metadata.companyRole === "ceo"`.
 */
export function isCeoAgent(agent: Agent | null | undefined): boolean {
  return agent?.metadata?.companyRole === "ceo";
}

/**
 * Build the CEO global-chat routing toolset. The caller is responsible for
 * gating this behind the company-model flag AND the CEO identity check
 * ({@link isCeoAgent}); this function trusts both and builds an isCeo:true tool.
 */
export function buildCeoChatToolset(options: {
  taskStore: TaskStore;
  ceoAgentId: string;
  /** Synthetic run id correlating this chat turn's audit events. */
  auditRunId: string;
  /** Live AgentStore for board seeding / execution-binding release. Optional:
   *  the board helpers fall back to constructing their own over the fusion dir. */
  agentStore?: AgentStore;
}): CeoChatToolsetResult {
  const { taskStore, ceoAgentId, auditRunId, agentStore } = options;

  const recordRoutingFailure = (mutationType: string, target: string, code: string, message: string) => {
    // PERSISTED audit event — never stdout-only.
    try {
      taskStore.recordRunAuditEvent({
        agentId: ceoAgentId,
        runId: auditRunId,
        domain: "database",
        mutationType,
        target,
        metadata: { code, message },
      });
    } catch {
      // Audit persistence is best-effort; the tool still surfaces the error
      // to the chat. (A throw here would mask the user-facing error.)
    }
  };

  const ceoRouting: CeoTaskRoutingOptions = {
    isCeo: true,
    onRoutingFailure: (info) => {
      recordRoutingFailure("task:create-routing-failure", info.boardId ?? "(no-board)", info.code, info.message);
    },
  };

  // CEO-only gate for the management tools (issue #4). Same posture as board_id
  // routing: the gate is isCeo:true here, but the engine tools enforce it too.
  const ceoGate: CeoToolGate = {
    isCeo: true,
    onDenied: (info) => {
      recordRoutingFailure("ceo-tool-denied", info.tool, "not-ceo", info.message);
    },
  };

  const taskCreate = createTaskCreateTool(
    taskStore,
    { sourceType: "chat_session", sourceAgentId: ceoAgentId },
    undefined,
    ceoRouting,
  );
  const boardList = createBoardListTool(taskStore);
  const readTools = createPlanningBoardTools(taskStore);

  // Company-model management tools (issue #4): board create/convert, cross-board
  // move, plan approve/reject, await-input answer, addressed message.
  const boardCreate = createBoardCreateTool(taskStore, ceoGate, { agentStore });
  const taskMoveBoard = createTaskMoveBoardTool(taskStore, ceoGate, { agentStore });
  const planApprove = createPlanApproveTool(taskStore, ceoGate);
  const planReject = createPlanRejectTool(taskStore, ceoGate);
  const answerInput = createTaskAnswerInputTool(taskStore);
  const sendMessage = createTaskSendMessageTool(taskStore, "agent");
  const boardConvert = createBoardConvertSimpleTool(taskStore, ceoGate, { agentStore });

  return {
    tools: [
      boardList,
      boardCreate,
      taskCreate,
      taskMoveBoard,
      planApprove,
      planReject,
      answerInput,
      sendMessage,
      boardConvert,
      ...readTools,
    ],
    systemPromptSuffix: CEO_ROUTING_SYSTEM_PROMPT,
  };
}
