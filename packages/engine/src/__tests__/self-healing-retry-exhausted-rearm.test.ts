/*
FNXC:AgentHeartbeat 2026-08-11-10:41:
A cooldown that has elapsed must recover a durable persona exactly through the
periodic sweep, while every existing pause and error suppression remains owned
by its present recovery path. These tests preserve the reported two-agent 429
symptom and the metadata-clearing variant that previously remained silent.
*/
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, AgentStore, Settings, TaskStore } from "@fusion/core";
import { SelfHealingManager } from "../self-healing.js";
import {
  DURABLE_RETRY_EXHAUSTED_REARM_FLOOR_MS,
  evaluateRetryExhaustedRearm,
} from "../agents/durable-agent-retry-rearm.js";
import {
  HEARTBEAT_ERROR_RETRY_EXHAUSTED_PAUSE_REASON,
  readHeartbeatErrorRetryCount,
} from "../agent-heartbeat.js";

vi.mock("../logger.js", () => ({
  createLogger: vi.fn(() => ({ log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  schedulerLog: { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const RATE_LIMIT_ERROR = JSON.stringify({
  type: "error",
  error: {
    type: "rate_limit_error",
    message: "This request would exceed the rate limit for your organization",
  },
});

function retryExhaustedAgent(overrides: Partial<Agent> = {}): Agent {
  const now = Date.now();
  return {
    id: "retry-exhausted-agent",
    name: "Reviewer",
    role: "reviewer",
    state: "paused",
    pauseReason: HEARTBEAT_ERROR_RETRY_EXHAUSTED_PAUSE_REASON,
    lastError: RATE_LIMIT_ERROR,
    runtimeConfig: { enabled: true },
    metadata: {
      durableErrorRecovery: {
        attempts: 5,
        exhausted: true,
        lastReason: "retry-budget-exhausted",
        nextRetryAt: new Date(now - 150 * 60_000).toISOString(),
        lastAttemptAt: new Date(now - 165 * 60_000).toISOString(),
      },
    },
    updatedAt: new Date(now - 165 * 60_000).toISOString(),
    ...overrides,
  } as Agent;
}

function createStatefulMockAgentStore(agents: Agent[]): AgentStore & { getAgent(id: string): Agent | undefined } {
  const agentMap = new Map(agents.map((agent) => [agent.id, { ...agent, metadata: agent.metadata ? { ...agent.metadata } : agent.metadata }]));
  return {
    getAgent: (id: string) => agentMap.get(id),
    listAgents: vi.fn().mockImplementation(async () => Array.from(agentMap.values())),
    updateAgentState: vi.fn().mockImplementation(async (id: string, state: Agent["state"]) => {
      const agent = agentMap.get(id);
      if (agent) agentMap.set(id, { ...agent, state });
    }),
    updateAgent: vi.fn().mockImplementation(async (id: string, patch: Partial<Agent>) => {
      const agent = agentMap.get(id);
      if (agent) agentMap.set(id, { ...agent, ...patch });
    }),
  } as unknown as AgentStore & { getAgent(id: string): Agent | undefined };
}

function createStore(): TaskStore {
  return {
    getSettings: vi.fn().mockResolvedValue({
      globalPause: false,
      enginePaused: false,
      taskStuckTimeoutMs: 60_000,
    } as unknown as Settings),
    recordRunAuditEvent: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
  } as unknown as TaskStore;
}

describe("retry-exhausted durable-agent rearm", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("evaluates cooldown, missing metadata, and all retry-exhausted suppressions", () => {
    const now = Date.now();
    const expired = retryExhaustedAgent();
    expect(evaluateRetryExhaustedRearm(expired, { now })).toMatchObject({ eligible: true, trigger: "next-retry-elapsed" });

    const future = retryExhaustedAgent({ metadata: { durableErrorRecovery: { nextRetryAt: new Date(now + 5 * 60_000).toISOString() } } });
    expect(evaluateRetryExhaustedRearm(future, { now })).toEqual({ eligible: false, reason: "next-retry-pending" });

    const oldWithoutRetry = retryExhaustedAgent({ metadata: { durableErrorRecovery: { nextRetryAt: null } }, updatedAt: new Date(now - 2 * 60 * 60_000).toISOString() });
    expect(evaluateRetryExhaustedRearm(oldWithoutRetry, { now })).toMatchObject({ eligible: true, trigger: "missing-next-retry-floor" });
    const recentWithoutRetry = retryExhaustedAgent({ metadata: { durableErrorRecovery: { nextRetryAt: null } }, updatedAt: new Date(now - 2 * 60_000).toISOString() });
    expect(evaluateRetryExhaustedRearm(recentWithoutRetry, { now })).toEqual({ eligible: false, reason: "missing-next-retry-floor-pending" });
    const malformedUpdatedAt = retryExhaustedAgent({ metadata: undefined, updatedAt: "not-a-date" });
    expect(evaluateRetryExhaustedRearm(malformedUpdatedAt, { now })).toEqual({ eligible: false, reason: "missing-next-retry-updated-at" });
    for (const metadata of [undefined, {}, { durableErrorRecovery: null }]) {
      expect(() => evaluateRetryExhaustedRearm(retryExhaustedAgent({ metadata, updatedAt: new Date(now - DURABLE_RETRY_EXHAUSTED_REARM_FLOOR_MS).toISOString() }), { now })).not.toThrow();
    }

    for (const pauseReason of ["error-unrecoverable", "heartbeat-model-unavailable", "manual", undefined]) {
      expect(evaluateRetryExhaustedRearm(retryExhaustedAgent({ pauseReason }), { now })).toEqual({ eligible: false, reason: "not-retry-exhausted-park" });
    }
    for (const state of ["error", "active", "idle", "running"] as const) {
      expect(evaluateRetryExhaustedRearm(retryExhaustedAgent({ state }), { now })).toEqual({ eligible: false, reason: "not-retry-exhausted-park" });
    }
    expect(evaluateRetryExhaustedRearm(retryExhaustedAgent({ metadata: { agentKind: "task-worker" } }), { now })).toEqual({ eligible: false, reason: "not-heartbeat-managed-or-ephemeral" });
    expect(evaluateRetryExhaustedRearm(retryExhaustedAgent({ runtimeConfig: { enabled: false } }), { now })).toEqual({ eligible: false, reason: "runtime-disabled" });
    expect(evaluateRetryExhaustedRearm(expired, { now, hasActiveAgentExecution: () => true })).toEqual({ eligible: false, reason: "active-agent-execution" });
    for (const lastError of ["Invalid API key", "billing", "quota exceeded"]) {
      expect(evaluateRetryExhaustedRearm(retryExhaustedAgent({ lastError }), { now })).toEqual({ eligible: false, reason: "not-heartbeat-error-recoverable" });
    }
    expect(evaluateRetryExhaustedRearm(retryExhaustedAgent({ lastError: "Cannot find module '/missing/node_modules/pkg' imported from /missing/entry.mjs" }), { now })).toEqual({ eligible: false, reason: "stale-worktree-module-resolution" });
  });

  it("rearms the two reported 429 parks without touching healthy agents", async () => {
    const now = Date.now();
    const agentStore = createStatefulMockAgentStore([
      retryExhaustedAgent({ id: "agent-a6de6afb", name: "Reviewer", updatedAt: new Date(now - 165 * 60_000).toISOString() }),
      retryExhaustedAgent({ id: "agent-9df1c48c", name: "Frontend Engineer", updatedAt: new Date(now - 165 * 60_000).toISOString() }),
      retryExhaustedAgent({ id: "healthy-fullstack", state: "active", pauseReason: undefined, lastError: undefined }),
      retryExhaustedAgent({ id: "healthy-cto", state: "active", pauseReason: undefined, lastError: undefined }),
    ]);
    const store = createStore();
    const restartDurableAgentHeartbeat = vi.fn().mockResolvedValue(true);
    const manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project", agentStore, restartDurableAgentHeartbeat });

    expect(await manager.recoverOrphanedAgents()).toBe(0);
    expect(agentStore.updateAgentState).not.toHaveBeenCalledWith("agent-a6de6afb", expect.anything());
    expect(agentStore.updateAgentState).not.toHaveBeenCalledWith("agent-9df1c48c", expect.anything());
    expect(await manager.rearmExpiredRetryExhaustedAgents()).toBe(2);

    for (const agentId of ["agent-a6de6afb", "agent-9df1c48c"]) {
      const agent = agentStore.getAgent(agentId)!;
      expect(agent.state).toBe("active");
      expect(agent.pauseReason).toBeUndefined();
      expect(agent.lastError).toBeUndefined();
      expect(readHeartbeatErrorRetryCount(agent)).toBe(0);
      expect(agent.metadata?.durableErrorRecovery).toBeUndefined();
      expect(restartDurableAgentHeartbeat).toHaveBeenCalledWith(agentId, { reason: "retry-exhausted-rearm", attempt: 1 });
    }
    expect(agentStore.updateAgentState).not.toHaveBeenCalledWith("healthy-fullstack", expect.anything());
    expect(agentStore.updateAgentState).not.toHaveBeenCalledWith("healthy-cto", expect.anything());
    expect(store.recordRunAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      mutationType: "agent:rearm-error-retry-exhausted",
      target: "agent-a6de6afb",
      metadata: expect.objectContaining({
        agentId: "agent-a6de6afb",
        attempts: 5,
        limit: 5,
        priorState: "paused",
        priorPauseReason: "error-retry-exhausted",
        reason: "next-retry-elapsed",
        source: "self-healing",
      }),
    }));
    const auditMetadata = (store.recordRunAuditEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.metadata;
    expect(JSON.stringify(auditMetadata)).not.toContain("lastError");
    manager.stop();
  });

  it("rearms an operator-cleared metadata park after the fixed floor", async () => {
    const now = Date.now();
    const agentStore = createStatefulMockAgentStore([
      retryExhaustedAgent({
        metadata: { durableErrorRecovery: { attempts: 0, exhausted: false, lastReason: null, nextRetryAt: null, lastAttemptAt: null } },
        updatedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
      }),
    ]);
    const manager = new SelfHealingManager(createStore(), { rootDir: "/tmp/test-project", agentStore, restartDurableAgentHeartbeat: vi.fn().mockResolvedValue(true) });

    expect(await manager.rearmExpiredRetryExhaustedAgents()).toBe(1);
    expect(agentStore.getAgent("retry-exhausted-agent")?.state).toBe("active");
    manager.stop();
  });

  it("keeps every suppressed variant parked in one sweep", async () => {
    const now = Date.now();
    const agentStore = createStatefulMockAgentStore([
      retryExhaustedAgent({ id: "future", metadata: { durableErrorRecovery: { nextRetryAt: new Date(now + 5 * 60_000).toISOString() } } }),
      retryExhaustedAgent({ id: "unrecoverable", pauseReason: "error-unrecoverable" }),
      retryExhaustedAgent({ id: "model", pauseReason: "heartbeat-model-unavailable" }),
      retryExhaustedAgent({ id: "manual", pauseReason: "manual" }),
      retryExhaustedAgent({ id: "ephemeral", metadata: { agentKind: "task-worker" } }),
      retryExhaustedAgent({ id: "disabled", runtimeConfig: { enabled: false } }),
      retryExhaustedAgent({ id: "active-execution" }),
      retryExhaustedAgent({ id: "billing", lastError: "billing" }),
      retryExhaustedAgent({ id: "stale-module", lastError: "Cannot find module '/missing/node_modules/pkg' imported from /missing/entry.mjs" }),
    ]);
    const restartDurableAgentHeartbeat = vi.fn().mockResolvedValue(true);
    const manager = new SelfHealingManager(createStore(), {
      rootDir: "/tmp/test-project",
      agentStore,
      hasActiveAgentExecution: (id) => id === "active-execution",
      restartDurableAgentHeartbeat,
    });

    expect(await manager.rearmExpiredRetryExhaustedAgents()).toBe(0);
    expect(agentStore.updateAgentState).not.toHaveBeenCalled();
    expect(agentStore.updateAgent).not.toHaveBeenCalled();
    expect(restartDurableAgentHeartbeat).not.toHaveBeenCalled();
    manager.stop();
  });

  it("isolates a failed mutation so later eligible agents still rearm", async () => {
    const agentStore = createStatefulMockAgentStore([
      retryExhaustedAgent({ id: "first" }),
      retryExhaustedAgent({ id: "second" }),
    ]);
    const updateAgent = agentStore.updateAgent as ReturnType<typeof vi.fn>;
    updateAgent.mockRejectedValueOnce(new Error("write failed"));
    const manager = new SelfHealingManager(createStore(), { rootDir: "/tmp/test-project", agentStore, restartDurableAgentHeartbeat: vi.fn().mockResolvedValue(true) });

    expect(await manager.rearmExpiredRetryExhaustedAgents()).toBe(1);
    expect(agentStore.getAgent("second")?.state).toBe("active");
    manager.stop();
  });

  it("registers the retry-exhausted sweep exactly once", () => {
    const source = readFileSync(fileURLToPath(new URL("../self-healing.ts", import.meta.url)), "utf8");
    expect(source.match(/name: "rearm-retry-exhausted-agents"/g)).toHaveLength(1);
  });
});
