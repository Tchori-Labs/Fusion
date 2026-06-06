/**
 * Board management routes (U12, R8/R17).
 *
 * Boards are the universal task container (U1/U10). U10 added the read-only
 * board-scoped payload (`GET /tasks/board-workflows`); U12 adds the WRITE
 * surfaces the simple-mode UI needs:
 *
 *  - POST   /boards                       — create a board (name + description +
 *                                            board type), reusing the U2 team seed
 *                                            so the board is born staffed (R8).
 *  - POST   /boards/:id/seed-team         — (re)run the U2 team seed for one board
 *                                            (the BoardTeamPanel "seed failed →
 *                                            retry" CTA, R8 idempotent seeding).
 *  - GET    /boards/:id/convert-preview   — preview the R17 conform mapping for a
 *                                            legacy/advanced board's workflow.
 *  - POST   /boards/:id/convert-to-simple — apply the R17 conform mapping (point
 *                                            the board at the conformed company
 *                                            workflow) and re-seed the team.
 *
 * Every route is project-scoped via `getProjectContext` (no new auth surface) and
 * emits a `board:*` SSE event so the dashboard Board view invalidates its
 * board-scoped payload. The team seed is flag-gated (`companyModel`) inside the
 * core helper, so these routes degrade to "board created, no team" when the flag
 * is off — config is data; the flag gates seeding, not board CRUD.
 */

import {
  AgentStore,
  isBuiltinWorkflowId,
  resolveWorkflowIrById,
  seedBoardTeam,
  seedBoardTeamForBoard,
  validateColumnAgentBindings,
  validateCompanyBoardColumnEdit,
  ColumnAgentBindingError,
  CompanyBoardColumnEditError,
  MANDATORY_ROLE_COLUMN_IDS,
  CE_BOARD_TEMPLATE_IR,
  CE_BOARD_DEFAULTS,
  type ConformColumnMapping,
  type TaskStore,
  type WorkflowIr,
  type WorkflowIrColumn,
} from "@fusion/core";
import {
  createBoardWithTeam,
  previewBoardConvertToSimple,
  convertBoardToSimple,
  deleteBoardAndRehome,
} from "@fusion/engine";
import { ApiError, badRequest, notFound } from "../api-error.js";
import { emitWorkflowSseEvent } from "../sse.js";
import type { ApiRoutesContext, ProjectContext } from "./types.js";

/** The built-in workflow id every freshly-created standard board points at. The
 *  team seed (when the flag is on) re-points it at a board-owned company workflow
 *  carrying the staffed role columns. */
const STANDARD_BOARD_WORKFLOW_ID = "builtin:coding";

/** The bundled Compound Engineering plugin id; the CE board type is offered only
 *  when this plugin is installed (U13). */
const COMPOUND_ENGINEERING_PLUGIN_ID = "fusion-plugin-compound-engineering";

/** A registry of selectable board types, rendered in the create-board picker.
 *  Extensible: a plugin board type (Compound Engineering, U13) adds an entry here
 *  gated on the plugin being installed. */
interface BoardTypeDescriptor {
  id: string;
  /** Built-in workflow the board initially points at, OR — for a plugin board
   *  type — a board-owned workflow built from `templateIr` (created before the
   *  team seed so the seed stamps onto the template, not over it). */
  workflowId: string;
  /** When set, a board-owned workflow is created from this IR and the board points
   *  at it (instead of `workflowId`) before seeding. Used by the CE board type so
   *  the team seed stamps role agents onto the CE template's role columns while
   *  preserving its CE-stage engine bindings + Compound column. */
  templateIr?: WorkflowIr;
  /** Whether plan approval is on by default for this board type (R20). */
  requirePlanApproval: boolean;
  /** Default LFG mode for this board type (R22). */
  lfgMode: boolean;
  /** When set, the type is offered only if this plugin id is installed (U13). */
  requiresPluginId?: string;
}

const BOARD_TYPES: Record<string, BoardTypeDescriptor> = {
  standard: {
    id: "standard",
    workflowId: STANDARD_BOARD_WORKFLOW_ID,
    requirePlanApproval: false,
    lfgMode: false,
  },
  "compound-engineering": {
    id: "compound-engineering",
    workflowId: STANDARD_BOARD_WORKFLOW_ID,
    templateIr: CE_BOARD_TEMPLATE_IR,
    // R20: plan approval is on by default for CE boards.
    requirePlanApproval: CE_BOARD_DEFAULTS.requirePlanApproval,
    lfgMode: CE_BOARD_DEFAULTS.lfgMode,
    requiresPluginId: COMPOUND_ENGINEERING_PLUGIN_ID,
  },
};

/** Probe whether the bundled CE plugin is installed for this project (U13). A
 *  board type with `requiresPluginId` is offered/accepted only when its plugin is
 *  present. Best-effort: a probe failure reads as "not installed" so the type is
 *  simply absent rather than erroring the picker. */
async function isPluginInstalled(store: TaskStore, pluginId: string): Promise<boolean> {
  try {
    const plugin = await store.getPluginStore().getPlugin(pluginId);
    return !!plugin;
  } catch {
    return false;
  }
}

/** Resolve the board types available for this project — the static registry minus
 *  any plugin-gated type whose plugin is not installed (U13). */
async function resolveAvailableBoardTypes(store: TaskStore): Promise<BoardTypeDescriptor[]> {
  const out: BoardTypeDescriptor[] = [];
  for (const descriptor of Object.values(BOARD_TYPES)) {
    if (descriptor.requiresPluginId) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isPluginInstalled(store, descriptor.requiresPluginId))) continue;
    }
    out.push(descriptor);
  }
  return out;
}

/** Resolve an AgentStore for seeding: prefer the engine's live store; fall back
 *  to a freshly-initialized one over the project's fusion dir (mirrors the agent
 *  routes' fallback construction). */
async function resolveAgentStore(ctx: ProjectContext): Promise<AgentStore> {
  const fromEngine = ctx.engine?.getAgentStore?.();
  if (fromEngine) return fromEngine as unknown as AgentStore;
  const store = new AgentStore({ rootDir: ctx.store.getFusionDir() });
  await store.init();
  return store;
}

export function registerBoardsRoutes(ctx: ApiRoutesContext): void {
  const { router, getProjectContext, runtimeLogger, rethrowAsApiError } = ctx;

  // GET /boards/types — the board types offered in the create-board picker (U13).
  // Plugin-gated types (Compound Engineering) appear only when their plugin is
  // installed; the client renders the picker from this list.
  router.get("/boards/types", async (req, res) => {
    try {
      const { store } = await getProjectContext(req);
      const available = await resolveAvailableBoardTypes(store);
      res.json({ types: available.map((d) => ({ id: d.id })) });
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });

  // POST /boards — create a board (R8). Seeds the team so it is born staffed.
  router.post("/boards", async (req, res) => {
    try {
      const projectCtx = await getProjectContext(req);
      const { store, projectId } = projectCtx;
      const { name, description, boardType, lfgMode } = req.body ?? {};
      if (!name || typeof name !== "string" || !name.trim()) {
        throw badRequest("name is required");
      }
      if (description !== undefined && typeof description !== "string") {
        throw badRequest("description must be a string");
      }
      const typeId = typeof boardType === "string" ? boardType : "standard";
      const descriptor = BOARD_TYPES[typeId];
      if (!descriptor) {
        throw badRequest(`Unknown board type '${typeId}'. Available: ${Object.keys(BOARD_TYPES).join(", ")}`);
      }
      // Plugin-gated types (CE, U13) are accepted only when the plugin is
      // installed — the server is the authority even if the client offered it.
      if (descriptor.requiresPluginId && !(await isPluginInstalled(store, descriptor.requiresPluginId))) {
        throw badRequest(
          `Board type '${typeId}' requires the '${descriptor.requiresPluginId}' plugin, which is not installed.`,
        );
      }

      // For a plugin board type carrying a template IR (CE), create a board-owned
      // workflow from the template FIRST and point the board at it, so the team
      // seed stamps role agents onto the template (preserving its CE-stage engine
      // bindings + Compound column) instead of overwriting with the company
      // template. Standard boards point at the built-in and the seed re-points.
      let initialWorkflowId = descriptor.workflowId;
      if (descriptor.templateIr) {
        const def = await store.createWorkflowDefinition({
          name: `${name.trim()} — ${typeId}`,
          description: `Board-owned ${typeId} workflow for "${name.trim()}".`,
          ir: descriptor.templateIr,
        });
        initialWorkflowId = def.id;
      }

      // Shared create+seed sequence (issue #4): create the board and run the U2
      // team seed (flag-gated + idempotent inside the helper; a no-op when the
      // company-model flag is off). The board-type registry (plugin gating,
      // template IR) stays in this route; the resolved workflow id + agent store
      // are passed in so the engine helper is the single source of truth shared
      // with fn_board_create.
      const agentStore = await resolveAgentStore(projectCtx);
      const { board, seeded } = await createBoardWithTeam(
        store,
        {
          name: name.trim(),
          description: typeof description === "string" ? description.trim() : "",
          workflowId: initialWorkflowId,
          requirePlanApproval: descriptor.requirePlanApproval,
          // The board type's default LFG posture, overridable by an explicit
          // toggle in the create modal (R22).
          lfgMode: typeof lfgMode === "boolean" ? lfgMode : descriptor.lfgMode,
        },
        {
          agentStore,
          onSeedError: (seedErr) => {
            // Non-fatal: the board exists; the BoardTeamPanel surfaces a retry CTA.
            runtimeLogger.warn(`board team seed failed for board "${name.trim()}"`, {
              error: seedErr instanceof Error ? seedErr.message : String(seedErr),
            });
          },
        },
      );

      emitWorkflowSseEvent("board:created", board, projectId);
      res.status(201).json({ board, seeded });
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });

  // POST /boards/:id/seed-team — (re)run the U2 team seed for one board. Powers
  // the BoardTeamPanel's "seed failed → retry" CTA (R8). Idempotent.
  router.post("/boards/:id/seed-team", async (req, res) => {
    try {
      const projectCtx = await getProjectContext(req);
      const { store, projectId } = projectCtx;
      const board = store.getBoardStore().getBoard(req.params.id);
      if (!board) throw notFound(`Board '${req.params.id}' not found`);

      const settings = await store.getSettings();
      const agentStore = await resolveAgentStore(projectCtx);
      // Seed both the project CEO and this board's team — covers a project whose
      // CEO was never seeded (flag flipped on after creation).
      await seedBoardTeam({ taskStore: store, agentStore, settings });
      const roleMap = await seedBoardTeamForBoard({ taskStore: store, agentStore, settings, boardId: board.id });

      const updated = store.getBoardStore().getBoard(board.id) ?? board;
      emitWorkflowSseEvent("board:updated", updated, projectId);
      res.json({ board: updated, seeded: Object.keys(roleMap).length > 0, team: roleMap });
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });

  // GET /boards/:id/convert-preview — preview the R17 conform mapping. Read-only:
  // resolves the board's current workflow IR and runs the conform planner.
  router.get("/boards/:id/convert-preview", async (req, res) => {
    try {
      const { store } = await getProjectContext(req);
      // Shared R17 conform preview (issue #4) — single source of truth with
      // fn_board_convert_simple (preview).
      const preview = await previewBoardConvertToSimple(store, req.params.id);
      if (!preview) throw notFound(`Board '${req.params.id}' not found`);
      res.json(preview);
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });

  // POST /boards/:id/convert-to-simple — apply the R17 conform mapping: persist
  // the conformed company workflow, point the board at it, then re-seed the team.
  router.post("/boards/:id/convert-to-simple", async (req, res) => {
    try {
      const projectCtx = await getProjectContext(req);
      const { store, projectId } = projectCtx;

      // Shared R17 conform apply (issue #4): persist the conformed company
      // workflow, re-point the board, re-seed the team. Single source of truth
      // with fn_board_convert_simple (apply=true).
      const agentStore = await resolveAgentStore(projectCtx);
      const result = await convertBoardToSimple(store, req.params.id, {
        agentStore,
        onSeedError: (seedErr) => {
          runtimeLogger.warn(`board team seed failed during convert for ${req.params.id}`, {
            error: seedErr instanceof Error ? seedErr.message : String(seedErr),
          });
        },
      });
      if (!result) throw notFound(`Board '${req.params.id}' not found`);

      emitWorkflowSseEvent("board:updated", result.board, projectId);
      const mappings: ConformColumnMapping[] = result.mappings;
      res.json({ board: result.board, seeded: result.seeded, mappings });
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });

  // POST /boards/:id/columns — the simple-mode custom-column ADD flow (U12,
  // R2/R3). Single flow: name the column, pick-or-create its agent, place it
  // either between the Executor (in-progress) and Reviewer (in-review) columns or
  // after in-review (before done). The server is the authority on placement
  // (`validateCompanyBoardColumnEdit` rejects before-todo even if the UI is
  // bypassed) and on staffing (`validateColumnAgentBindings` surfaces AE3 — an
  // already-staffed agent — as a typed error mapped to HTTP 400 inline).
  //
  // Body: { name, placement: "before-review" | "after-review",
  //         agent?: { agentId } | { create: { name, soul? } } }
  router.post("/boards/:id/columns", async (req, res) => {
    try {
      const projectCtx = await getProjectContext(req);
      const { store, projectId } = projectCtx;
      const board = store.getBoardStore().getBoard(req.params.id);
      if (!board) throw notFound(`Board '${req.params.id}' not found`);

      const { name, placement, agent } = req.body ?? {};
      if (!name || typeof name !== "string" || !name.trim()) {
        throw badRequest("name is required");
      }
      if (placement !== "before-review" && placement !== "after-review") {
        throw badRequest("placement must be 'before-review' or 'after-review'");
      }

      const existingIr = await resolveWorkflowIrById(store as unknown as TaskStore, board.workflowId);
      if (existingIr.version !== "v2") {
        throw badRequest("This board's workflow has no columns to extend");
      }

      const agentStore = await resolveAgentStore(projectCtx);

      // Build the new column id (collision-safe) and determine the legal insert
      // position so placement (U3) can be validated BEFORE any agent is created.
      const reserved = new Set(existingIr.columns.map((c) => c.id));
      const baseColumnId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom";
      let columnId = baseColumnId;
      // Disambiguate via a counter (deploy-1, deploy-2, …) rather than repeatedly
      // appending "-1", which would loop forever / produce deploy-1-1-1.
      for (let suffix = 1; reserved.has(columnId); suffix += 1) columnId = `${baseColumnId}-${suffix}`;

      const reviewIndex = existingIr.columns.findIndex((c) => c.role === "reviewer");
      const insertAt =
        placement === "before-review"
          ? reviewIndex >= 0 ? reviewIndex : existingIr.columns.length
          : reviewIndex >= 0 ? reviewIndex + 1 : existingIr.columns.length;

      // Assemble the IR with a given (or absent) agent binding for the new column.
      const buildNextIr = (boundAgentId: string | undefined): WorkflowIr => {
        const newColumn: WorkflowIrColumn = {
          id: columnId,
          name: name.trim(),
          traits: [],
          ...(boundAgentId ? { agent: { agentId: boundAgentId, mode: "defer" as const } } : {}),
        };
        const nextColumns = [...existingIr.columns];
        nextColumns.splice(insertAt, 0, newColumn);
        return { ...existingIr, columns: nextColumns };
      };

      // Authority check #1 — placement (U3): nothing before todo. This is
      // agent-independent, so run it FIRST. Creating the agent only after this
      // passes avoids orphaning an unbound agent on a rejected placement.
      try {
        validateCompanyBoardColumnEdit(existingIr, buildNextIr(undefined));
      } catch (editErr) {
        if (editErr instanceof CompanyBoardColumnEditError) {
          throw badRequest(editErr.message, { columnId: editErr.columnId, reason: editErr.reason });
        }
        throw editErr;
      }

      // Resolve / create the agent that staffs the new column. `createdAgentId`
      // tracks an agent WE created so it can be cleaned up if a later validation
      // rejects (a pre-existing `agent.agentId` is never deleted).
      let agentId: string | undefined;
      let createdAgentId: string | undefined;
      if (agent && typeof agent === "object") {
        if (typeof agent.agentId === "string" && agent.agentId.trim()) {
          agentId = agent.agentId.trim();
        } else if (agent.create && typeof agent.create === "object" && typeof agent.create.name === "string") {
          const created = await agentStore.createAgent({
            name: agent.create.name.trim(),
            role: "executor",
            soul: typeof agent.create.soul === "string" ? agent.create.soul : `Staffs the "${name.trim()}" column.`,
            // Board-scope the new agent so cross-board staffing is rejected later.
            metadata: { companyBoardId: board.id },
          });
          agentId = created.id;
          createdAgentId = created.id;
        }
      }

      const nextIr: WorkflowIr = buildNextIr(agentId);

      // Authority check #2 — staffing (U2/R3): board-scoped, one-agent-per-column
      // (AE3). On rejection, delete any agent we just created so retries don't
      // accumulate orphaned unbound agents.
      if (agentId) {
        try {
          const settings = await store.getSettings();
          // Agents already staffed on OTHER boards (board-scoping for markerless agents).
          const otherBoardAgentIds = new Set<string>();
          try {
            for (const other of store.getBoardStore().listBoards()) {
              if (other.id === board.id) continue;
              const otherIr = await resolveWorkflowIrById(store as unknown as TaskStore, other.workflowId);
              if (otherIr.version !== "v2") continue;
              for (const c of otherIr.columns) if (c.agent?.agentId) otherBoardAgentIds.add(c.agent.agentId);
            }
          } catch {
            // best-effort cross-board scan
          }
          await validateColumnAgentBindings({
            ir: nextIr,
            agentStore,
            settings,
            confirmPolicyEscalation: false,
            mode: "simple",
            mandatoryRoleColumnIds: MANDATORY_ROLE_COLUMN_IDS,
            boardId: board.id,
            otherBoardAgentIds,
          });
        } catch (bindErr) {
          if (createdAgentId) {
            try {
              await agentStore.deleteAgent(createdAgentId);
            } catch {
              // best-effort cleanup; surface the original rejection regardless.
            }
          }
          if (bindErr instanceof ColumnAgentBindingError) {
            // AE3 + board-scope + CEO rejections surface inline as HTTP 400.
            throw badRequest(bindErr.message, {
              columnId: bindErr.columnId,
              agentId: bindErr.agentId,
              reason: bindErr.reason,
            });
          }
          throw bindErr;
        }
      }

      // Persist: fork a built-in workflow to a board-owned one; else update in place.
      let workflowId = board.workflowId;
      if (isBuiltinWorkflowId(board.workflowId)) {
        const def = await store.createWorkflowDefinition({
          name: `${board.name} — workflow`,
          description: `Board-owned workflow for "${board.name}" (custom columns).`,
          ir: nextIr,
        });
        store.getBoardStore().updateBoard(board.id, { workflowId: def.id });
        workflowId = def.id;
      } else {
        await store.updateWorkflowDefinition(board.workflowId, { ir: nextIr });
      }

      emitWorkflowSseEvent("board:updated", store.getBoardStore().getBoard(board.id), projectId);
      res.status(201).json({ boardId: board.id, columnId, workflowId, agentId: agentId ?? null });
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });

  // DELETE /boards/:id — delete a board, re-homing its tasks to the project
  // default board first (the `board:deleted` SSE event consumer — Board.tsx —
  // refetches and falls back to the default board if the selected board vanished).
  //
  // Refuses to delete the DEFAULT board while it still homes `boardId = null`
  // tasks (they implicitly home there and have no fallback), and refuses when
  // there is no other board to re-home onto. Re-homing is a SYSTEM action that
  // releases each task's execution-agent bindings (shared move-to-board sequence);
  // the board's own column-agent bindings are discarded with its workflow IR.
  router.delete("/boards/:id", async (req, res) => {
    try {
      const projectCtx = await getProjectContext(req);
      const { store, projectId, engine } = projectCtx;

      const result = await deleteBoardAndRehome(store, engine?.getAgentStore?.(), req.params.id);
      if (!result.ok) {
        if (result.code === "board-not-found") throw notFound(result.message);
        // default-homes-null-tasks / no-rehome-target are client-correctable 400s.
        throw badRequest(result.message, { reason: result.code });
      }

      emitWorkflowSseEvent("board:deleted", { id: result.deletedBoardId }, projectId);
      res.json({
        deletedBoardId: result.deletedBoardId,
        rehomedToBoardId: result.rehomedToBoardId,
        rehomedTaskIds: result.rehomedTaskIds,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      rethrowAsApiError(err);
    }
  });
}
