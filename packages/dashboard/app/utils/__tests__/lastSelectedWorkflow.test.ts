import { afterEach, describe, expect, it, vi } from "vitest";
import { readLastSelectedWorkflowId, writeLastSelectedWorkflowId } from "../lastSelectedWorkflow";

describe("lastSelectedWorkflow", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("round-trips the selected workflow id per project", () => {
    writeLastSelectedWorkflowId("project-a", "WF-1");

    expect(readLastSelectedWorkflowId("project-a")).toBe("WF-1");
  });

  it("keeps project cache keys isolated", () => {
    writeLastSelectedWorkflowId("project-a", "WF-1");
    writeLastSelectedWorkflowId("project-b", "WF-2");

    expect(readLastSelectedWorkflowId("project-a")).toBe("WF-1");
    expect(readLastSelectedWorkflowId("project-b")).toBe("WF-2");
  });

  it("uses a default key for callers without a project id", () => {
    writeLastSelectedWorkflowId(undefined, "WF-default");
    writeLastSelectedWorkflowId("project-a", "WF-project");

    expect(readLastSelectedWorkflowId()).toBe("WF-default");
    expect(readLastSelectedWorkflowId("project-a")).toBe("WF-project");
  });

  it("returns null for missing, empty, or non-string entries", () => {
    expect(readLastSelectedWorkflowId("missing")).toBeNull();

    window.localStorage.setItem("fusion:last-selected-workflow:empty", "");
    expect(readLastSelectedWorkflowId("empty")).toBeNull();

    vi.spyOn(Storage.prototype, "getItem").mockReturnValueOnce({ workflowId: "WF-1" } as unknown as string);
    expect(readLastSelectedWorkflowId("non-string")).toBeNull();
  });

  it("swallows localStorage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => writeLastSelectedWorkflowId("project-a", "WF-1")).not.toThrow();
  });

  it("swallows localStorage read failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });

    expect(readLastSelectedWorkflowId("project-a")).toBeNull();
  });

  it("returns null without window for SSR callers", () => {
    vi.stubGlobal("window", undefined);

    expect(readLastSelectedWorkflowId("project-a")).toBeNull();
    expect(() => writeLastSelectedWorkflowId("project-a", "WF-1")).not.toThrow();
  });
});
