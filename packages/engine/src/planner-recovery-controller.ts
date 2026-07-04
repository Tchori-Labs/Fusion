/**
 * FNXC:PlannerOversight 2026-07-04-12:00:
 * FN-7512 engine-side dispatcher for bounded autonomous planner recovery.
 * Consumes the FN-7511 `PlannerOverseerMonitor` observation (or an injected
 * snapshot provider), calls the pure `decidePlannerRecovery` from
 * `@fusion/core`, and — ONLY when the observation's effective oversight
 * level is `"autonomous"` — dispatches the chosen bounded action (inject
 * guidance / retry the step / request a targeted fix) through injected
 * `PlannerRecoveryHandlers`. Mirrors the `AutoRecoveryDispatcher` +
 * `StuckTaskDetector` conventions: a per-`(taskId, watchedStage)` in-memory
 * attempt registry, degrade-to-no-op on any error, never throw.
 *
 * Minimum guards owned by this task (FN-7514 owns the comprehensive
 * human-control safeguards): `tick()` is a no-op when `task.userPaused` is
 * true, and no handler here ever performs a merge/PR or destructive/
 * external-service action — those are excluded by construction (only
 * `injectGuidance` / `retryStep` / `requestTargetedFix` exist) and are owned
 * by FN-7513's confirmation-gated layer.
 */

import type { PlannerConfirmationRequest, PlannerRecoveryDecision, PlannerRecoveryObservation, Task } from "@fusion/core";
import { decidePlannerRecovery, PLANNER_RECOVERY_MAX_ATTEMPTS } from "@fusion/core";
import { createLogger, type Logger } from "./logger.js";
import type { OverseerStageObservation } from "./planner-overseer.js";

/** Minimal shared context threaded through to handlers (e.g. a run-id or clock). */
export interface PlannerRecoveryContext {
  now?: () => number;
  [key: string]: unknown;
}

/**
 * Side-effecting handlers a caller wires up using ONLY existing mechanisms
 * (steering-comment API for guidance/targeted-fix, store retry/re-enqueue
 * for step retry). All optional and all async; a missing handler simply
 * means that action is not dispatched (degrades to no-op, never throws).
 */
export interface PlannerRecoveryHandlers {
  injectGuidance?: (task: Task, decision: PlannerRecoveryDecision, ctx: PlannerRecoveryContext) => Promise<void>;
  retryStep?: (task: Task, decision: PlannerRecoveryDecision, ctx: PlannerRecoveryContext) => Promise<void>;
  requestTargetedFix?: (task: Task, decision: PlannerRecoveryDecision, ctx: PlannerRecoveryContext) => Promise<void>;
  /**
   * FN-7513: records/surfaces a pending `PlannerConfirmationRequest` for a
   * confirmation-required decision. MUST NOT perform the proposed side
   * effect itself — that only ever happens via `resolveConfirmation` after
   * an explicit approval. Optional; when absent the controller still tracks
   * the pending request in its own registry (so `getPendingConfirmations`
   * still reflects it), it just has no external surface to notify.
   */
  requestConfirmation?: (task: Task, request: PlannerConfirmationRequest, ctx: PlannerRecoveryContext) => Promise<void>;
  /**
   * FN-7513: executes a `"merge_pr"`-classified action (advance/retry a
   * merge, promote a shared branch, open/update/merge a pull request) by
   * reusing existing store/merger mechanisms. Invoked ONLY from
   * `resolveConfirmation(..., "approved")` — never from `tick`. Receives
   * `taskId` rather than a full `Task` because `resolveConfirmation` (an
   * out-of-band approval entry point) is not handed the task object;
   * wire a handler that looks the task up via its own store access if needed.
   */
  executeMergePrAction?: (taskId: string, request: PlannerConfirmationRequest, ctx: PlannerRecoveryContext) => Promise<void>;
  /**
   * FN-7513: executes a `"destructive_external"`-classified action. Invoked
   * ONLY from `resolveConfirmation(..., "approved")` — never from `tick`.
   */
  executeDestructiveExternalAction?: (taskId: string, request: PlannerConfirmationRequest, ctx: PlannerRecoveryContext) => Promise<void>;
}

/** Minimal seam for fetching the current watched-stage observation for a task. */
export interface PlannerRecoverySnapshotProvider {
  getSnapshot(taskId: string): OverseerStageObservation | null | undefined | Promise<OverseerStageObservation | null | undefined>;
}

/** The delivered `PlannerOverseerMonitor` shape this controller can also accept directly (FN-7511). */
export interface PlannerRecoveryObservationSource {
  getObservations(taskId: string): OverseerStageObservation[];
}

export interface PlannerRecoveryControllerOptions {
  /** Either a `{ getSnapshot(taskId) }` provider, or a `PlannerOverseerMonitor`-shaped source (adapted via its latest recorded observation). */
  snapshotProvider: PlannerRecoverySnapshotProvider | PlannerRecoveryObservationSource;
  handlers?: PlannerRecoveryHandlers;
  logger?: Logger;
}

const controllerLog = createLogger("planner-recovery-controller");

function isSnapshotProvider(value: unknown): value is PlannerRecoverySnapshotProvider {
  return typeof (value as PlannerRecoverySnapshotProvider)?.getSnapshot === "function";
}

function normalizeProvider(
  provider: PlannerRecoverySnapshotProvider | PlannerRecoveryObservationSource,
): PlannerRecoverySnapshotProvider {
  if (isSnapshotProvider(provider)) {
    return provider;
  }
  const source = provider as PlannerRecoveryObservationSource;
  return {
    getSnapshot: (taskId: string) => {
      const observations = source.getObservations(taskId);
      return observations.length > 0 ? observations[observations.length - 1] : null;
    },
  };
}

/**
 * FNXC:PlannerOversight 2026-07-04-12:00:
 * Bounded autonomous-recovery dispatcher. Holds a per-`(taskId,
 * watchedStage)` attempt registry (in-memory; not persisted — the wider
 * intervention timeline is FN-7519's responsibility) and increments it only
 * when an action is actually dispatched. Once a stage's attempt count
 * reaches `PLANNER_RECOVERY_MAX_ATTEMPTS`, `decidePlannerRecovery` returns
 * `exhausted: true` and `tick()` takes no further action for that stage.
 */
export class PlannerRecoveryController {
  private readonly snapshotProvider: PlannerRecoverySnapshotProvider;
  private readonly handlers: PlannerRecoveryHandlers;
  private readonly logger: Logger;
  private readonly attempts = new Map<string, number>();
  /**
   * FN-7513: pending confirmation requests keyed by `(taskId, watchedStage)`.
   * A stage can carry at most one pending request at a time — `tick` never
   * creates a duplicate for a stage that already has one pending, keeping
   * the request surface idempotent for downstream UX/audit consumers.
   */
  private readonly pendingConfirmations = new Map<string, PlannerConfirmationRequest>();
  private confirmationSeq = 0;

  constructor(options: PlannerRecoveryControllerOptions) {
    this.snapshotProvider = normalizeProvider(options.snapshotProvider);
    this.handlers = options.handlers ?? {};
    this.logger = options.logger ?? controllerLog;
  }

  private attemptKey(taskId: string, stage: string): string {
    return `${taskId}::${stage}`;
  }

  private nextRequestId(taskId: string): string {
    this.confirmationSeq += 1;
    return `planner-confirm-${taskId}-${Date.now()}-${this.confirmationSeq}`;
  }

  /**
   * Evaluate and, when warranted, dispatch one bounded recovery action for
   * `task`'s currently watched stage. Never throws — any handler/registry
   * error degrades to a no-op. Returns the computed decision (even when no
   * action was dispatched) for logging/testing, or `null` when the task is
   * user-paused, has no active observation, or the snapshot lookup failed.
   */
  async tick(task: Task, ctx: PlannerRecoveryContext = {}): Promise<PlannerRecoveryDecision | null> {
    try {
      if (!task || task.userPaused === true) {
        return null;
      }

      const snapshot = await this.getSnapshotSafe(task.id);
      if (!snapshot) {
        return null;
      }

      const key = this.attemptKey(task.id, snapshot.stage);
      const attemptCount = this.attempts.get(key) ?? 0;

      const decision = decidePlannerRecovery({
        snapshot: snapshot as unknown as PlannerRecoveryObservation,
        attemptState: { attemptCount, attemptLimit: PLANNER_RECOVERY_MAX_ATTEMPTS },
      });

      if (decision.action === "none") {
        return decision;
      }

      // FN-7513: confirmation-required decisions (merge/PR, destructive/
      // external) NEVER dispatch a side-effecting handler from `tick` — they
      // only ever surface (idempotently) as a pending `PlannerConfirmationRequest`.
      // Actual execution happens strictly via `resolveConfirmation(..."approved"...)`.
      if (decision.requiresConfirmation) {
        await this.requestConfirmationIfAbsent(task, decision, key, ctx);
        return decision;
      }

      const dispatched = await this.dispatch(decision, task, ctx);
      if (dispatched) {
        this.attempts.set(key, attemptCount + 1);
      }
      return decision;
    } catch (err) {
      this.logger.warn(`tick failed for ${task?.id ?? "?"}: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }
  }

  private async dispatch(decision: PlannerRecoveryDecision, task: Task, ctx: PlannerRecoveryContext): Promise<boolean> {
    try {
      if (decision.action === "inject_guidance") {
        if (!this.handlers.injectGuidance) return false;
        await this.handlers.injectGuidance(task, decision, ctx);
        return true;
      }
      if (decision.action === "retry_step") {
        if (!this.handlers.retryStep) return false;
        await this.handlers.retryStep(task, decision, ctx);
        return true;
      }
      if (decision.action === "request_targeted_fix") {
        if (!this.handlers.requestTargetedFix) return false;
        await this.handlers.requestTargetedFix(task, decision, ctx);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(`handler for action="${decision.action}" failed on ${task.id}: ${(err as Error)?.message ?? String(err)}`);
      return false;
    }
  }

  private async getSnapshotSafe(taskId: string): Promise<OverseerStageObservation | null> {
    try {
      const result = await this.snapshotProvider.getSnapshot(taskId);
      return result ?? null;
    } catch {
      return null;
    }
  }

  /**
   * FN-7513: records a pending `PlannerConfirmationRequest` for `decision`
   * (which has `requiresConfirmation: true`) unless one already exists for
   * this `(taskId, watchedStage)` — idempotent, so repeated `tick`s never
   * create duplicates. Never throws — a `requestConfirmation` handler
   * rejection is swallowed (the pending record is still tracked locally).
   */
  private async requestConfirmationIfAbsent(
    task: Task,
    decision: PlannerRecoveryDecision,
    key: string,
    ctx: PlannerRecoveryContext,
  ): Promise<void> {
    const existing = this.pendingConfirmations.get(key);
    if (existing && existing.status === "pending") {
      return;
    }

    const request: PlannerConfirmationRequest = {
      requestId: this.nextRequestId(task.id),
      taskId: task.id,
      watchedStage: decision.watchedStage ?? (key.split("::")[1] as PlannerConfirmationRequest["watchedStage"]),
      sideEffectClass: decision.sideEffectClass,
      proposedAction: decision.proposedAction ?? decision.action,
      reason: decision.reason,
      sourceLinks: decision.sourceLinks,
      requestedAt: Date.now(),
      status: "pending",
    };
    this.pendingConfirmations.set(key, request);

    if (this.handlers.requestConfirmation) {
      try {
        await this.handlers.requestConfirmation(task, request, ctx);
      } catch (err) {
        this.logger.warn(`requestConfirmation handler failed for ${task.id}: ${(err as Error)?.message ?? String(err)}`);
      }
    }
  }

  /**
   * FN-7513: getters so downstream UX/audit (FN-7515+/FN-7517/FN-7519/FN-7520)
   * can read the currently pending confirmation requests for a task.
   */
  getPendingConfirmations(taskId: string): PlannerConfirmationRequest[] {
    const prefix = `${taskId}::`;
    const result: PlannerConfirmationRequest[] = [];
    for (const [key, request] of this.pendingConfirmations) {
      if (key.startsWith(prefix) && request.status === "pending") {
        result.push(request);
      }
    }
    return result;
  }

  /**
   * FN-7513: resolves a pending confirmation. On `"approved"`, dispatches the
   * proposed action through the matching execution handler (`merge_pr` →
   * `executeMergePrAction`, `destructive_external` →
   * `executeDestructiveExternalAction`) and clears the pending request. On
   * `"denied"`, clears the request with no side effect — the task is left
   * for other escalation (FN-7514+).
   *
   * FNXC:PlannerOversight 2026-07-04-14:30: a `"denied"` resolution also
   * consumes one bounded-recovery attempt for this `(taskId, watchedStage)`
   * pair (the same attempt budget `dispatch()` consumes for bounded actions).
   * Without this, a denial simply cleared the pending slot and the very next
   * `tick()` would recreate an identical confirmation prompt forever — a
   * human `"denied"` a merge/PR/destructive action, so it must not keep
   * resurfacing on every poll. Counting denials against
   * `PLANNER_RECOVERY_MAX_ATTEMPTS` means the same gated action stops
   * re-prompting once the budget is exhausted (surfaced as `none,
   * exhausted: true` by `decidePlannerRecovery`), matching bounded-recovery
   * exhaustion semantics rather than inventing a new state machine.
   * Never throws — a rejecting execution handler is logged and swallowed;
   * the request is still cleared so it does not linger as pending forever.
   */
  async resolveConfirmation(
    taskId: string,
    requestId: string,
    resolution: "approved" | "denied",
    resolvedBy?: string,
    ctx: PlannerRecoveryContext = {},
  ): Promise<PlannerConfirmationRequest | null> {
    try {
      const prefix = `${taskId}::`;
      let matchedKey: string | null = null;
      let matched: PlannerConfirmationRequest | null = null;
      for (const [key, request] of this.pendingConfirmations) {
        if (key.startsWith(prefix) && request.requestId === requestId && request.status === "pending") {
          matchedKey = key;
          matched = request;
          break;
        }
      }
      if (!matchedKey || !matched) {
        return null;
      }

      const resolved: PlannerConfirmationRequest = {
        ...matched,
        status: resolution === "approved" ? "approved" : "denied",
        resolvedAt: Date.now(),
        resolvedBy,
      };

      // Clear the pending slot regardless of outcome — an approved/denied
      // request must never be re-surfaced as pending.
      this.pendingConfirmations.delete(matchedKey);

      if (resolution === "approved") {
        await this.executeApproved(taskId, resolved, ctx);
      } else {
        // FN-7513: a denial consumes one bounded-recovery attempt for this
        // (taskId, watchedStage) pair so the identical confirmation prompt
        // does not resurface on every subsequent tick() — it stops once the
        // shared PLANNER_RECOVERY_MAX_ATTEMPTS budget is exhausted (see the
        // resolveConfirmation JSDoc above).
        const stage = resolved.watchedStage ?? matchedKey.split("::")[1];
        if (stage) {
          const attemptKey = this.attemptKey(taskId, stage);
          this.attempts.set(attemptKey, (this.attempts.get(attemptKey) ?? 0) + 1);
        }
      }

      return resolved;
    } catch (err) {
      this.logger.warn(`resolveConfirmation failed for ${taskId}: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }
  }

  private async executeApproved(taskId: string, request: PlannerConfirmationRequest, ctx: PlannerRecoveryContext): Promise<void> {
    try {
      if (request.sideEffectClass === "merge_pr") {
        await this.handlers.executeMergePrAction?.(taskId, request, ctx);
        return;
      }
      if (request.sideEffectClass === "destructive_external") {
        await this.handlers.executeDestructiveExternalAction?.(taskId, request, ctx);
        return;
      }
    } catch (err) {
      this.logger.warn(
        `execution handler for sideEffectClass="${request.sideEffectClass}" failed on ${taskId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  /** Reset all attempt state and pending confirmations for `taskId` (every watched stage) — call on terminal task transitions. */
  clear(taskId: string): void {
    const prefix = `${taskId}::`;
    for (const key of [...this.attempts.keys()]) {
      if (key.startsWith(prefix)) {
        this.attempts.delete(key);
      }
    }
    for (const key of [...this.pendingConfirmations.keys()]) {
      if (key.startsWith(prefix)) {
        this.pendingConfirmations.delete(key);
      }
    }
  }

  /** Test/inspection seam: current attempt count for a `(taskId, watchedStage)` pair. */
  getAttemptCount(taskId: string, stage: string): number {
    return this.attempts.get(this.attemptKey(taskId, stage)) ?? 0;
  }
}
