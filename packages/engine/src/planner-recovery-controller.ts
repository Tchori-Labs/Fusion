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

import type { PlannerRecoveryDecision, PlannerRecoveryObservation, Task } from "@fusion/core";
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

  constructor(options: PlannerRecoveryControllerOptions) {
    this.snapshotProvider = normalizeProvider(options.snapshotProvider);
    this.handlers = options.handlers ?? {};
    this.logger = options.logger ?? controllerLog;
  }

  private attemptKey(taskId: string, stage: string): string {
    return `${taskId}::${stage}`;
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

  /** Reset all attempt state for `taskId` (every watched stage) — call on terminal task transitions. */
  clear(taskId: string): void {
    const prefix = `${taskId}::`;
    for (const key of [...this.attempts.keys()]) {
      if (key.startsWith(prefix)) {
        this.attempts.delete(key);
      }
    }
  }

  /** Test/inspection seam: current attempt count for a `(taskId, watchedStage)` pair. */
  getAttemptCount(taskId: string, stage: string): number {
    return this.attempts.get(this.attemptKey(taskId, stage)) ?? 0;
  }
}
