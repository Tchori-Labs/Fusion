import { describe, expect, it } from "vitest";
import {
  deriveAutoTaskBranchName,
  derivePerTaskBranchName,
  resolveEntryPointBranchAssignment,
  sanitizeBranchSegment,
} from "../branch-assignment.js";

describe("branch-assignment", () => {
  it("sanitizes branch segments", () => {
    expect(sanitizeBranchSegment("  FN-123 add parser!!!  ")).toBe("fn-123-add-parser");
  });

  it("derives per-task branches", () => {
    expect(derivePerTaskBranchName("feature/planning", "FN-123 add parser")).toBe("feature/planning/fn-123-add-parser");
    expect(derivePerTaskBranchName(undefined, "FN-123")).toBeUndefined();
    expect(derivePerTaskBranchName("feature/planning", "   ")).toBe("feature/planning");
  });

  it("derives auto task branches", () => {
    expect(deriveAutoTaskBranchName("FN-5671", "Branch Strategy Dropdown")).toBe("fusion/fn-5671-branch-strategy-dropdown");
    expect(deriveAutoTaskBranchName("FN-5671", "   ")).toBe("fusion/fn-5671");
  });

  it("resolves shared mode with per-task working branch and shared merge target", () => {
    const resolvedBranch = "feature/planning";
    const assignment = resolveEntryPointBranchAssignment({
      assignmentMode: "shared",
      resolvedBranch,
      taskSegment: "FN-123 add parser",
    });
    expect(assignment).toEqual({
      workingBranch: "feature/planning/fn-123-add-parser",
      mergeTargetBranch: "feature/planning",
    });
    expect(assignment.workingBranch).not.toBe(resolvedBranch);
  });

  it("resolves shared mode with empty segment fallback", () => {
    expect(resolveEntryPointBranchAssignment({
      assignmentMode: "shared",
      resolvedBranch: "feature/planning",
      taskSegment: "   ",
    })).toEqual({
      workingBranch: "feature/planning",
      mergeTargetBranch: "feature/planning",
    });
  });

  it("resolves shared mode with undefined resolved branch", () => {
    expect(resolveEntryPointBranchAssignment({
      assignmentMode: "shared",
      resolvedBranch: undefined,
      taskSegment: "FN-123",
    })).toEqual({
      workingBranch: undefined,
      mergeTargetBranch: undefined,
    });
  });

  it("resolves per-task-derived mode", () => {
    expect(resolveEntryPointBranchAssignment({
      assignmentMode: "per-task-derived",
      resolvedBranch: "feature/planning",
      taskSegment: "FN-123 add parser",
    })).toEqual({
      workingBranch: "feature/planning/fn-123-add-parser",
      mergeTargetBranch: undefined,
    });
  });

  it("resolves project-default mode", () => {
    expect(resolveEntryPointBranchAssignment({
      assignmentMode: "project-default",
      resolvedBranch: "feature/planning",
      taskSegment: "FN-123 add parser",
    })).toEqual({
      workingBranch: undefined,
      mergeTargetBranch: undefined,
    });
  });

  it("resolves existing and custom-new modes", () => {
    expect(resolveEntryPointBranchAssignment({
      assignmentMode: "existing",
      resolvedBranch: "feature/existing",
    })).toEqual({
      workingBranch: "feature/existing",
      mergeTargetBranch: undefined,
    });
    expect(resolveEntryPointBranchAssignment({
      assignmentMode: "custom-new",
      resolvedBranch: "feature/custom",
    })).toEqual({
      workingBranch: "feature/custom",
      mergeTargetBranch: undefined,
    });
  });
});
