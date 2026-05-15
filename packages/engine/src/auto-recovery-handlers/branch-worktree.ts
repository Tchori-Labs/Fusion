import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { TaskStore } from "@fusion/core";
import type { AutoRecoveryContext, AutoRecoveryDecision, AutoRecoveryFailure } from "../auto-recovery.js";
import type { Logger } from "../logger.js";
import type { RunAuditor } from "../run-audit.js";

const execAsync = promisify(exec);

export interface BranchWorktreeRecoveryDeps {
  taskStore: TaskStore;
  runAudit: RunAuditor;
  logger?: Logger;
  spawnAiRecoverySession?: (
    failure: AutoRecoveryFailure,
    decision: AutoRecoveryDecision,
    ctx: AutoRecoveryContext,
  ) => Promise<{ outcome: "resolved" | "exhausted" | "error"; metadata?: Record<string, unknown> }>;
  now?: () => Date;
}

export class BranchWorktreeAutoRecoveryHandler {
  constructor(private readonly deps: BranchWorktreeRecoveryDeps) {
    void this.deps;
    void execAsync;
  }

  async issueRetry(_failure: AutoRecoveryFailure, _decision: AutoRecoveryDecision, _ctx: AutoRecoveryContext): Promise<void> {
    // Implemented in FN-4536 Step 2.
  }

  async spawnAiRecovery(_failure: AutoRecoveryFailure, _decision: AutoRecoveryDecision, _ctx: AutoRecoveryContext): Promise<void> {
    // Implemented in FN-4536 Step 4.
  }
}
