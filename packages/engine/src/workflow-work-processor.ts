import type { Settings, WorkflowWorkItemKind } from "@fusion/core";
import { claimDueWorkflowWorkItem, type WorkflowWorkSchedulerStore } from "./workflow-work-scheduler.js";
import { WorkflowTaskRuntime, type WorkflowTaskRuntimeResult } from "./workflow-task-runtime.js";

export interface WorkflowWorkProcessorOptions {
  leaseOwner: string;
  leaseDurationMs: number;
  now?: string;
  kinds?: WorkflowWorkItemKind[];
}

export interface WorkflowWorkProcessorResult {
  claimed: boolean;
  workItemId?: string;
  taskId?: string;
  runtime?: WorkflowTaskRuntimeResult;
}

export async function processDueWorkflowWorkItem(
  store: WorkflowWorkSchedulerStore,
  runtime: WorkflowTaskRuntime,
  settings: (Pick<Settings, "experimentalFeatures"> & Partial<Settings>) | undefined,
  opts: WorkflowWorkProcessorOptions,
): Promise<WorkflowWorkProcessorResult> {
  const dispatch = claimDueWorkflowWorkItem(store, {
    now: opts.now,
    leaseOwner: opts.leaseOwner,
    leaseDurationMs: opts.leaseDurationMs,
    kinds: opts.kinds,
  });
  if (!dispatch) return { claimed: false };

  const runtimeResult = await runtime.runWorkItem(dispatch.workItem, settings);
  return {
    claimed: true,
    workItemId: dispatch.workItem.id,
    taskId: dispatch.taskId,
    runtime: runtimeResult,
  };
}

export function workflowMergeWorkKinds(): WorkflowWorkItemKind[] {
  return ["merge", "manual-hold"];
}
