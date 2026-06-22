const LAST_SELECTED_WORKFLOW_PREFIX = "fusion:last-selected-workflow:";
const DEFAULT_PROJECT_CACHE_KEY = "default";

function cacheKey(projectId?: string): string {
  return `${LAST_SELECTED_WORKFLOW_PREFIX}${projectId ?? DEFAULT_PROJECT_CACHE_KEY}`;
}

/**
 * FNXC:WorkflowDefaults 2026-06-22-00:00:
 * Persist the board's current workflow lane per project so New Task can default its existing workflow selector to the current or last selected lane without leaking choices across projects.
 */
export function readLastSelectedWorkflowId(projectId?: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(cacheKey(projectId));
    return typeof value === "string" && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSelectedWorkflowId(projectId: string | undefined, workflowId: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(cacheKey(projectId), workflowId);
  } catch {
    // Private-mode/quota failures should never block board workflow selection.
  }
}
