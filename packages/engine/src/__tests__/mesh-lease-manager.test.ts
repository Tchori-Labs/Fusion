import { describe, expect, it, vi } from "vitest";
import type { AgentStore, Task, TaskStore } from "@fusion/core";
import { MeshLeaseManager } from "../mesh-lease-manager.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-1",
    description: "x",
    column: "in-progress",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    checkedOutBy: "agent-1",
    checkedOutAt: "2026-05-01T00:00:00.000Z",
    checkoutLeaseRenewedAt: "2026-05-01T00:00:00.000Z",
    checkoutLeaseEpoch: 1,
    checkoutNodeId: "node-a",
    ...overrides,
  };
}

describe("MeshLeaseManager", () => {
  it("prefers active local execution over stale replicated timestamps", async () => {
    const getTask = vi.fn().mockResolvedValue(task());
    const manager = new MeshLeaseManager({
      taskStore: { getTask } as unknown as TaskStore,
      getExecutingTaskIds: () => new Set(["FN-1"]),
    });

    const result = await manager.isLeaseRecoverable(task(), Date.parse("2026-05-01T00:10:00.000Z"));
    expect(result).toEqual({ recoverable: false, reason: "active_local_execution" });
  });

  it("marks lease recoverable when owner node is offline", async () => {
    const manager = new MeshLeaseManager({
      taskStore: {} as TaskStore,
      nodeHealthMonitor: { getNodeHealth: () => "offline" } as any,
    });

    const result = await manager.isLeaseRecoverable(task(), Date.parse("2026-05-01T00:01:00.000Z"));
    expect(result).toEqual({ recoverable: true, reason: "owner_node_offline" });
  });

  it("recovers stale lease by bumping epoch and clearing owner fields", async () => {
    const currentTask = task({ checkoutLeaseRenewedAt: "2026-05-01T00:00:00.000Z" });
    const updateTask = vi.fn().mockResolvedValue(currentTask);
    const moveTask = vi.fn().mockResolvedValue(currentTask);
    const logEntry = vi.fn().mockResolvedValue(undefined);
    const taskStore = {
      getTask: vi.fn().mockResolvedValue(currentTask),
      updateTask,
      moveTask,
      logEntry,
    } as unknown as TaskStore;

    const agentStore = {
      getAgent: vi.fn().mockResolvedValue({
        id: "agent-1",
        runtimeConfig: { heartbeatTimeoutMs: 60_000 },
        lastHeartbeatAt: "2026-05-01T00:00:00.000Z",
      }),
    } as unknown as AgentStore;

    const manager = new MeshLeaseManager({ taskStore, agentStore });
    const ok = await manager.recoverAbandonedLease("FN-1", "stale-heartbeat");

    expect(ok).toBe(true);
    expect(updateTask).toHaveBeenCalledWith(
      "FN-1",
      expect.objectContaining({
        checkedOutBy: null,
        checkedOutAt: null,
        checkoutNodeId: null,
        checkoutRunId: null,
        checkoutLeaseRenewedAt: null,
        checkoutLeaseEpoch: 2,
      }),
      undefined,
    );
    expect(moveTask).toHaveBeenCalledWith("FN-1", "todo", expect.any(Object));
  });
});
