import { isEphemeralAgent, type Agent } from "@fusion/core";
import { isStaleWorktreeModuleResolutionError } from "../errors/transient-error-detector.js";
import {
  HEARTBEAT_ERROR_RETRY_EXHAUSTED_PAUSE_REASON,
  isHeartbeatErrorRecoverable,
  isHeartbeatManaged,
  readHeartbeatErrorRetryCount,
} from "./agent-heartbeat-error-recovery.js";

export const DURABLE_RETRY_EXHAUSTED_REARM_FLOOR_MS = 15 * 60_000;

type RetryExhaustedRearmIneligible = {
  eligible: false;
  reason:
    | "not-heartbeat-managed-or-ephemeral"
    | "not-retry-exhausted-park"
    | "runtime-disabled"
    | "active-agent-execution"
    | "stale-worktree-module-resolution"
    | "not-heartbeat-error-recoverable"
    | "next-retry-pending"
    | "missing-next-retry-floor-pending"
    | "missing-next-retry-updated-at";
};

type RetryExhaustedRearmEligible = {
  eligible: true;
  trigger: "next-retry-elapsed" | "missing-next-retry-floor";
  priorAttempts: number;
};

export type RetryExhaustedRearmEvaluation = RetryExhaustedRearmIneligible | RetryExhaustedRearmEligible;

/**
 * FNXC:AgentHeartbeat 2026-08-11-10:41:
 * `error-retry-exhausted` must not be an absorbing state: its `nextRetryAt` was
 * written but never read back for paused parks, so a transient provider 429
 * silenced two persona heartbeats for 2h30 with no non-restart exit. This
 * predicate gives the periodic sweep one auditable re-entry per recorded
 * cooldown (or after a 15-minute metadata-clear floor) while the timer remains
 * unchanged: paused agents stay non-tickable until the sweep restores active.
 */
export function readDurableErrorRecoveryNextRetryAtMs(agent: Pick<Agent, "metadata">): number | undefined {
  const metadata = agent.metadata;
  const recovery = metadata?.durableErrorRecovery;
  if (!recovery || typeof recovery !== "object") {
    return undefined;
  }
  const nextRetryAt = (recovery as Record<string, unknown>).nextRetryAt;
  if (typeof nextRetryAt !== "string") {
    return undefined;
  }
  const parsed = Date.parse(nextRetryAt);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function evaluateRetryExhaustedRearm(
  agent: Agent,
  options: { now: number; hasActiveAgentExecution?: (agentId: string) => boolean },
): RetryExhaustedRearmEvaluation {
  if (isEphemeralAgent(agent) || !isHeartbeatManaged(agent)) {
    return { eligible: false, reason: "not-heartbeat-managed-or-ephemeral" };
  }
  if (agent.state !== "paused" || agent.pauseReason !== HEARTBEAT_ERROR_RETRY_EXHAUSTED_PAUSE_REASON) {
    return { eligible: false, reason: "not-retry-exhausted-park" };
  }
  if (agent.runtimeConfig?.enabled === false) {
    return { eligible: false, reason: "runtime-disabled" };
  }
  if (options.hasActiveAgentExecution?.(agent.id) === true) {
    return { eligible: false, reason: "active-agent-execution" };
  }
  if (isStaleWorktreeModuleResolutionError(agent.lastError ?? "")) {
    return { eligible: false, reason: "stale-worktree-module-resolution" };
  }
  if (!isHeartbeatErrorRecoverable(agent)) {
    return { eligible: false, reason: "not-heartbeat-error-recoverable" };
  }

  const nextRetryAtMs = readDurableErrorRecoveryNextRetryAtMs(agent);
  if (nextRetryAtMs !== undefined) {
    if (nextRetryAtMs > options.now) {
      return { eligible: false, reason: "next-retry-pending" };
    }
    return {
      eligible: true,
      trigger: "next-retry-elapsed",
      priorAttempts: readHeartbeatErrorRetryCount(agent),
    };
  }

  const updatedAtMs = Date.parse(agent.updatedAt ?? "");
  if (!Number.isFinite(updatedAtMs)) {
    return { eligible: false, reason: "missing-next-retry-updated-at" };
  }
  if (options.now - updatedAtMs < DURABLE_RETRY_EXHAUSTED_REARM_FLOOR_MS) {
    return { eligible: false, reason: "missing-next-retry-floor-pending" };
  }
  return {
    eligible: true,
    trigger: "missing-next-retry-floor",
    priorAttempts: readHeartbeatErrorRetryCount(agent),
  };
}
