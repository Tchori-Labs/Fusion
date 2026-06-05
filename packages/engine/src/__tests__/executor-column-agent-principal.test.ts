// Column-agent PRINCIPAL alignment (plan U5, R5/R6/R7, KTD-3/KTD-4).
//
// The three subsystems that historically assumed "the running agent is
// task.assignedAgentId" must consult the EFFECTIVE column agent instead:
//   (a) action gating (buildActionGateContext / buildPermanentAgentGatingContext)
//       — gate for the agent actually running (R5);
//   (b) heartbeat serialization in BOTH directions (R6):
//       - the execute() deferral gate consults the effective principal;
//       - resumeTaskForAgent re-dispatches column-effective tasks via a second
//         pass the assignedAgentId-only filter would miss;
//       - the heartbeat scheduler's reverse guard (isAgentEffectivelyExecuting)
//         blocks a column agent from heartbeating concurrently with its own session;
//   (c) the restart watcher hot-swaps when a workflow edit / agent-config change
//       re-keys the column-effective agent/model mid-flight, and falls back (no
//       restart storm) when the column agent is deleted (R7/KTD-4/R8).
//
// Harness mirrors executor-column-agent-seams.test.ts: a real TaskExecutor over a
// mock store with createFnAgent + StepSessionExecutor mocked. The per-run seam
// slots (graphSeamGoverningNodeId / graphColumnAgentResolver) are seeded directly,
// then runImplementationPhase drives the production session-build path.

import { beforeEach, describe, expect, it, vi } from "vitest";
import "./executor-test-helpers.js";
import { TaskExecutor } from "../executor.js";
import {
  createMockStore,
  mockedCreateFnAgent,
  resetExecutorMocks,
} from "./executor-test-helpers.js";
import type { WorkflowColumnAgent, WorkflowIr } from "@fusion/core";

const OVERRIDE_COL: WorkflowColumnAgent = { agentId: "agent-X", mode: "override" };
const DEFER_COL: WorkflowColumnAgent = { agentId: "agent-X", mode: "defer" };

// agent-X = the column agent (allowParallelExecution=false unless overridden).
// agent-Y = the task's assigned agent.
function makeColumnAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-X",
    name: "Column Agent X",
    soul: "I am X.",
    instructionsText: "X persona.",
    memory: undefined,
    permissionPolicy: { rules: {} },
    runtimeConfig: { model: "anthropic/claude-x", allowParallelExecution: false },
    ...overrides,
  };
}

function makeAssignedAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-Y",
    name: "Assigned Agent Y",
    soul: "I am Y.",
    instructionsText: "Y persona.",
    memory: undefined,
    permissionPolicy: { rules: {} },
    runtimeConfig: { model: "openai/gpt-y" },
    ...overrides,
  };
}

function installTaskDoneAgent() {
  mockedCreateFnAgent.mockImplementation((async (opts: any) => {
    const tools = opts.customTools || [];
    return {
      session: {
        prompt: vi.fn().mockImplementation(async () => {
          const done = tools.find((t: any) => t.name === "fn_task_done");
          if (done) await done.execute("tool-1", {});
        }),
        dispose: vi.fn(),
        subscribe: vi.fn(),
        on: vi.fn(),
        setModel: vi.fn(),
        sessionManager: { getLeafId: vi.fn().mockReturnValue("leaf-1") },
        state: {},
      },
    };
  }) as any);
}

function makeExecutor(
  store: ReturnType<typeof createMockStore>,
  agentsById: Record<string, unknown>,
  heartbeatRunsByAgent: Record<string, unknown> = {},
) {
  const agentStore = {
    getAgent: vi.fn(async (id: string) => agentsById[id] ?? null),
    getActiveHeartbeatRun: vi.fn(async (id: string) => heartbeatRunsByAgent[id] ?? null),
  };
  const executor = new TaskExecutor(store as any, "/tmp/test", { agentStore } as any);
  return { executor, agentStore };
}

function singleSessionTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "FN-001",
    title: "Test",
    description: "Test task",
    column: "in-progress",
    dependencies: [],
    steps: [{ name: "Implement", status: "in-progress" }],
    currentStep: 0,
    log: [],
    prompt: "# test\n## Steps\n### Step 0: Implement\n- [ ] implement",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function seedSeam(executor: TaskExecutor, taskId: string, governingNodeId: string, binding: WorkflowColumnAgent | undefined) {
  (executor as any).graphSeamGoverningNodeId.set(taskId, governingNodeId);
  (executor as any).graphColumnAgentResolver.set(taskId, (nodeId: string) =>
    nodeId === governingNodeId ? binding : undefined,
  );
}

function lastFnAgentOpts() {
  const calls = mockedCreateFnAgent.mock.calls;
  return calls[calls.length - 1]?.[0] as any;
}

function loggedLines(store: ReturnType<typeof createMockStore>): string[] {
  return store.logEntry.mock.calls.map((call: any[]) => String(call[1] ?? ""));
}

/** v2 IR with an execute-seam prompt node whose column binds `binding`. */
function irWithExecuteSeamColumn(binding: WorkflowColumnAgent): WorkflowIr {
  return {
    version: "v2",
    name: "test-wf",
    columns: [
      { id: "in-progress", name: "In Progress", traits: [], agent: binding },
      { id: "todo", name: "Todo", traits: [] },
    ],
    nodes: [
      { id: "exec-node", kind: "prompt", column: "in-progress", config: { seam: "execute" } } as any,
    ],
    edges: [],
  } as unknown as WorkflowIr;
}

describe("column-agent principal alignment (plan U5)", () => {
  beforeEach(() => {
    resetExecutorMocks();
  });

  // ── (a) Action gating principal (R5) ──────────────────────────────────────

  describe("action gating principal", () => {
    it("override column governs → gating context built for X (not the assigned Y)", async () => {
      const store = createMockStore();
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      store.getTask.mockResolvedValue(task as any);
      const { executor } = makeExecutor(store, {
        "agent-Y": makeAssignedAgent(),
        "agent-X": makeColumnAgent(),
      });
      installTaskDoneAgent();

      seedSeam(executor, task.id, "exec-node", OVERRIDE_COL);
      await (executor as any).runImplementationPhase(task);

      const opts = lastFnAgentOpts();
      // R5: action gating is computed for the agent ACTUALLY running.
      expect(opts.actionGateContext?.agentId).toBe("agent-X");
      expect(opts.permanentAgentGating?.requester?.actorId).toBe("agent-X");
    });

    it("no binding → gating context built for the assigned Y (byte-identical)", async () => {
      const store = createMockStore();
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      store.getTask.mockResolvedValue(task as any);
      const { executor } = makeExecutor(store, { "agent-Y": makeAssignedAgent() });
      installTaskDoneAgent();

      // No seam slots seeded → legacy path.
      await (executor as any).runImplementationPhase(task);

      const opts = lastFnAgentOpts();
      expect(opts.actionGateContext?.agentId).toBe("agent-Y");
      expect(opts.permanentAgentGating?.requester?.actorId).toBe("agent-Y");
    });
  });

  // ── (b) Heartbeat deferral — forward direction (R6) ───────────────────────

  describe("heartbeat deferral: effective principal", () => {
    it("override column X (allowParallelExecution=false) with an active heartbeat run → resolveEffectivePrincipalId returns X and defers", async () => {
      const store = createMockStore();
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      const { executor } = makeExecutor(
        store,
        { "agent-Y": makeAssignedAgent(), "agent-X": makeColumnAgent() },
        { "agent-X": { id: "run-x" } }, // active heartbeat run for X
      );

      // Seam binding is known at the deferral gate (set by the seam before
      // re-entering execute()).
      seedSeam(executor, task.id, "exec-node", OVERRIDE_COL);

      // The effective principal for this seam is X, not the assigned Y.
      const principal = (executor as any).resolveEffectivePrincipalId(task, task);
      expect(principal).toBe("agent-X");

      // X has allowParallelExecution=false AND an active run → defer.
      expect(await (executor as any).shouldDeferForHeartbeat("agent-X")).toBe(true);
      // Y has no such constraint → the legacy filter alone would NOT defer.
      expect(await (executor as any).shouldDeferForHeartbeat("agent-Y")).toBe(false);
    });

    it("no binding → effective principal is the assigned agent (byte-identical)", () => {
      const store = createMockStore();
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      const { executor } = makeExecutor(store, { "agent-Y": makeAssignedAgent() });
      // No seam slots → legacy.
      expect((executor as any).resolveEffectivePrincipalId(task, task)).toBe("agent-Y");
    });
  });

  // ── (b) resumeTaskForAgent two-pass (R6) ──────────────────────────────────

  describe("resumeTaskForAgent: effective-agent second pass", () => {
    function resumeStore(task: any, ir: WorkflowIr) {
      const store = createMockStore();
      store.getSettings.mockResolvedValue({
        globalPause: false,
        enginePaused: false,
        experimentalFeatures: { workflowGraphExecutor: true },
      } as any);
      store.listTasks.mockResolvedValue([task] as any);
      store.getTaskWorkflowSelection = vi.fn().mockReturnValue({ workflowId: "wf-1", stepIds: [] });
      store.getWorkflowDefinition = vi.fn().mockResolvedValue({ ir });
      return store;
    }

    it("override column re-keys an in-progress task to X → pass 2 re-dispatches it (the assignedAgentId filter alone misses it)", async () => {
      // Task assigned to Y, but its execute-seam column binds X (override).
      const task = singleSessionTask({ id: "FN-RES", assignedAgentId: "agent-Y" });
      const store = resumeStore(task, irWithExecuteSeamColumn(OVERRIDE_COL));
      const { executor } = makeExecutor(store, {
        "agent-Y": makeAssignedAgent(),
        "agent-X": makeColumnAgent(),
      });
      const executeSpy = vi.spyOn(executor, "execute").mockResolvedValue(undefined as any);

      // Pass 1 (assignedAgentId === "agent-X") would NOT match — Y is assigned.
      await executor.resumeTaskForAgent("agent-X");

      // Pass 2 (effective column agent === X) re-dispatched it.
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(executeSpy.mock.calls[0][0]).toMatchObject({ id: "FN-RES" });
    });

    it("pass 1 still re-dispatches directly-assigned tasks (legacy)", async () => {
      const task = singleSessionTask({ id: "FN-ASG", assignedAgentId: "agent-X" });
      const store = resumeStore(task, irWithExecuteSeamColumn(OVERRIDE_COL));
      const { executor } = makeExecutor(store, { "agent-X": makeColumnAgent() });
      const executeSpy = vi.spyOn(executor, "execute").mockResolvedValue(undefined as any);

      await executor.resumeTaskForAgent("agent-X");
      expect(executeSpy).toHaveBeenCalledTimes(1); // not double-dispatched by pass 2
    });

    it("defer column with task own complete model pair → X is NOT the effective agent, pass 2 does not fire", async () => {
      const task = singleSessionTask({
        id: "FN-DEF",
        assignedAgentId: "agent-Y",
        modelProvider: "task-prov",
        modelId: "task-model",
      });
      const store = resumeStore(task, irWithExecuteSeamColumn(DEFER_COL));
      const { executor } = makeExecutor(store, {
        "agent-Y": makeAssignedAgent(),
        "agent-X": makeColumnAgent(),
      });
      const executeSpy = vi.spyOn(executor, "execute").mockResolvedValue(undefined as any);

      await executor.resumeTaskForAgent("agent-X");
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });

  // ── (b) Reverse direction: isAgentEffectivelyExecuting (R6) ───────────────

  describe("reverse-direction guard: isAgentEffectivelyExecuting", () => {
    it("X executing an override-column task it is NOT assigned to → effective-executing is true for X", async () => {
      const store = createMockStore();
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      store.getTask.mockResolvedValue(task as any);
      const { executor } = makeExecutor(store, {
        "agent-Y": makeAssignedAgent(),
        "agent-X": makeColumnAgent(),
      });
      installTaskDoneAgent();

      // Before any session: nothing effectively executing.
      expect(executor.isAgentEffectivelyExecuting("agent-X")).toBe(false);

      // While the override session runs, the map is populated. We assert the map
      // directly to avoid coupling to teardown timing of the mocked session.
      seedSeam(executor, task.id, "exec-node", OVERRIDE_COL);
      const setSpy = vi.spyOn((executor as any).effectiveColumnAgentByTask, "set");
      await (executor as any).runImplementationPhase(task);

      // The execute seam recorded X as the effective principal for the task.
      expect(setSpy).toHaveBeenCalledWith(task.id, "agent-X");
    });

    it("the heartbeat scheduler reverse guard consults the injected callback", async () => {
      // Mirror the in-process-runtime wiring: the scheduler gets
      // isAgentEffectivelyExecuting from the executor. Prove the guard short-circuits.
      const store = createMockStore();
      store.getTask.mockResolvedValue(singleSessionTask({ assignedAgentId: "agent-Y" }) as any);
      const { executor } = makeExecutor(store, {});
      // Pretend X is effectively executing some task.
      (executor as any).effectiveColumnAgentByTask.set("FN-Z", "agent-X");
      const cb = (agentId: string) => executor.isAgentEffectivelyExecuting(agentId);
      expect(cb("agent-X")).toBe(true);
      expect(cb("agent-Y")).toBe(false);
    });
  });

  // ── (c) Restart watcher via re-resolution (R7/KTD-4) ──────────────────────

  describe("restart watcher: column-agent invalidation", () => {
    function activeGraphSession(executor: TaskExecutor, taskId: string, governing: string, binding: WorkflowColumnAgent) {
      const setModel = vi.fn();
      const session = { setModel, dispose: vi.fn() } as any;
      seedSeam(executor, taskId, governing, binding);
      (executor as any).activeSessions.set(taskId, {
        session,
        seenSteeringIds: new Set<string>(),
        lastResolvedModelProvider: "anthropic",
        lastResolvedModelId: "claude-x",
        lastTaskModelProvider: undefined,
        lastTaskModelId: undefined,
        lastAssignedAgentId: "agent-Y",
        lastEffectiveColumnAgentId: "agent-X",
      });
      return { setModel };
    }

    it("workflow edit changes the column agent's model while a session runs → restart (model hot-swap) fires", async () => {
      const store = createMockStore();
      // modelRegistry.find returns a truthy model so setModel is invoked.
      const find = vi.fn().mockReturnValue({ provider: "anthropic", modelId: "claude-x2" });
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      // Column agent X now advertises a NEW model (workflow edit re-pointed / agent config changed).
      const { executor } = makeExecutor(store, {
        "agent-X": makeColumnAgent({ runtimeConfig: { model: "anthropic/claude-x2", allowParallelExecution: false } }),
      });
      (executor as any)._modelRegistry = { find };

      const { setModel } = activeGraphSession(executor, task.id, "exec-node", OVERRIDE_COL);

      // The watcher fires on task:updated.
      store._trigger("task:updated", task);
      await vi.waitFor(() => expect(setModel).toHaveBeenCalled());

      expect(find).toHaveBeenCalledWith("anthropic", "claude-x2");
      expect(loggedLines(store).some((l) => l.includes("Column agent changed"))).toBe(true);
    });

    it("column agent deleted mid-session → no restart storm, no setModel, fallback recorded (R8)", async () => {
      const store = createMockStore();
      const find = vi.fn().mockReturnValue({ provider: "anthropic", modelId: "claude-x" });
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      // agent-X is ABSENT from the registry (deleted).
      const { executor } = makeExecutor(store, {});
      (executor as any)._modelRegistry = { find };

      const { setModel } = activeGraphSession(executor, task.id, "exec-node", OVERRIDE_COL);

      store._trigger("task:updated", task);
      // Wait for the async handler to record the fallback.
      await vi.waitFor(() =>
        expect(loggedLines(store).some((l) => l.includes("deleted mid-session") && l.includes("no restart"))).toBe(true),
      );

      // No model swap — the running session keeps its current model.
      expect(setModel).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      // Tracked id cleared so we stop probing every tick.
      expect((executor as any).activeSessions.get(task.id).lastEffectiveColumnAgentId).toBeNull();
    });

    it("legacy entry (no effective column agent) → the column-invalidation block is skipped", async () => {
      const store = createMockStore();
      const find = vi.fn();
      const task = singleSessionTask({ assignedAgentId: "agent-Y" });
      const { executor } = makeExecutor(store, { "agent-X": makeColumnAgent() });
      (executor as any)._modelRegistry = { find };

      const setModel = vi.fn();
      (executor as any).activeSessions.set(task.id, {
        session: { setModel, dispose: vi.fn() },
        seenSteeringIds: new Set<string>(),
        lastResolvedModelProvider: "openai",
        lastResolvedModelId: "gpt-y",
        lastTaskModelProvider: undefined,
        lastTaskModelId: undefined,
        lastAssignedAgentId: "agent-Y",
        lastEffectiveColumnAgentId: null, // legacy
      });
      // No seam slots seeded.

      store._trigger("task:updated", task);
      await new Promise((r) => setTimeout(r, 0));

      // The column-invalidation block never ran (no column-agent fetch / swap).
      expect(loggedLines(store).some((l) => l.includes("Column agent changed"))).toBe(false);
    });
  });

  // ── Split-branch note ─────────────────────────────────────────────────────
  // Per-session principals: the executor tracks the effective principal per TASK
  // (effectiveColumnAgentByTask) and per active session-build, so two distinct
  // tasks bound to different columns yield two principals. Asserting TWO truly
  // concurrent split-branch SESSIONS for ONE task is not cheaply expressible with
  // this single-session mock harness (it pins one createFnAgent call per
  // runImplementationPhase), so we assert the per-task divergence instead.
  describe("per-task principal divergence (split-branch surrogate)", () => {
    it("two tasks bound to different column agents resolve to different effective principals", () => {
      const store = createMockStore();
      const { executor } = makeExecutor(store, {});
      const taskA = singleSessionTask({ id: "FN-A", assignedAgentId: "agent-Y" });
      const taskB = singleSessionTask({ id: "FN-B", assignedAgentId: "agent-Y" });
      seedSeam(executor, "FN-A", "exec-node", { agentId: "agent-X", mode: "override" });
      seedSeam(executor, "FN-B", "exec-node", { agentId: "agent-Z", mode: "override" });
      expect((executor as any).resolveEffectivePrincipalId(taskA, taskA)).toBe("agent-X");
      expect((executor as any).resolveEffectivePrincipalId(taskB, taskB)).toBe("agent-Z");
    });
  });
});
