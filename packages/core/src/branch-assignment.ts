export type EntryPointAssignmentMode = "shared" | "per-task-derived" | "project-default" | "existing" | "custom-new";

export interface EntryPointBranchAssignmentInput {
  assignmentMode: EntryPointAssignmentMode;
  resolvedBranch?: string;
  taskSegment?: string;
}

export interface EntryPointBranchAssignment {
  workingBranch?: string;
  mergeTargetBranch?: string;
}

export function sanitizeBranchSegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/.]+|[-/.]+$/g, "")
    .slice(0, 48);
}

function normalizeOptionalBranch(value: string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function derivePerTaskBranchName(sharedBranch: string | undefined, taskSegment: string): string | undefined {
  const base = normalizeOptionalBranch(sharedBranch);
  if (!base) return undefined;
  const segment = sanitizeBranchSegment(taskSegment);
  if (!segment) return base;
  return `${base}/${segment}`;
}

export function deriveAutoTaskBranchName(taskId: string, shortName: string): string {
  const base = `fusion/${taskId.toLowerCase()}`;
  const segment = sanitizeBranchSegment(shortName ?? "");
  return segment ? `${base}-${segment}` : base;
}

/**
 * Resolves task branch assignment for entry points with distinct working and merge-target concerns.
 * In shared mode, the shared branch is only a merge target; the working branch is always per-task-derived.
 */
export function resolveEntryPointBranchAssignment(
  input: EntryPointBranchAssignmentInput,
): EntryPointBranchAssignment {
  const { assignmentMode, resolvedBranch, taskSegment = "" } = input;

  switch (assignmentMode) {
    case "shared":
      return {
        workingBranch: derivePerTaskBranchName(resolvedBranch, taskSegment),
        mergeTargetBranch: normalizeOptionalBranch(resolvedBranch),
      };
    case "per-task-derived":
      return {
        workingBranch: derivePerTaskBranchName(resolvedBranch, taskSegment),
        mergeTargetBranch: undefined,
      };
    case "project-default":
      return {
        workingBranch: undefined,
        mergeTargetBranch: undefined,
      };
    case "existing":
    case "custom-new":
      return {
        workingBranch: normalizeOptionalBranch(resolvedBranch),
        mergeTargetBranch: undefined,
      };
  }
}
