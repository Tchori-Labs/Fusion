import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RightDock, RIGHT_DOCK_OPEN_STORAGE_KEY, RIGHT_DOCK_VIEW_STORAGE_KEY, RIGHT_DOCK_WIDTH_STORAGE_KEY } from "../RightDock";
import { RightDockExpandModal } from "../RightDockExpandModal";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    fetchWorkspaceFileList: vi.fn().mockResolvedValue({ entries: [], currentPath: "." }),
  };
});

const renderProps = {
  addToast: vi.fn(),
  projectId: "project-1",
};

const toolTabIds = [
  "right-dock-tab-usage",
  "right-dock-tab-activity-log",
  "right-dock-tab-github-import",
  "right-dock-tab-git-manager",
  "right-dock-tab-files",
  "right-dock-tab-automation",
];

const removedViewTabIds = [
  "right-dock-tab-documents",
  "right-dock-tab-research",
  "right-dock-tab-insights",
  "right-dock-tab-skills",
  "right-dock-tab-memory",
  "right-dock-tab-secrets",
  "right-dock-tab-evals",
  "right-dock-tab-goals",
  "right-dock-tab-todos",
  "right-dock-tab-devserver",
  "right-dock-tab-stash-recovery",
];

describe("RightDock", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders Files by default and restores only persisted inline views", () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <RightDock open={true} onOpenChange={onOpenChange} renderProps={renderProps} />,
    );

    expect(screen.getByTestId("right-dock-tab-files")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("right-dock-files-view")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("right-dock-tab-automation"));
    expect(window.localStorage.getItem(RIGHT_DOCK_VIEW_STORAGE_KEY)).toBeNull();
    unmount();

    render(<RightDock open={true} onOpenChange={onOpenChange} renderProps={renderProps} />);
    expect(screen.getByTestId("right-dock-tab-files")).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to Files when storage points at a removed right-dock view", () => {
    window.localStorage.setItem(RIGHT_DOCK_VIEW_STORAGE_KEY, "documents");
    render(<RightDock open={true} onOpenChange={vi.fn()} renderProps={renderProps} />);

    expect(screen.getByTestId("right-dock-tab-files")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("right-dock-files-view")).toBeInTheDocument();
    expect(screen.queryByTestId("right-dock-tab-documents")).toBeNull();
  });

  it("renders exactly the six right-dock tool entries and no removed content-view tabs", () => {
    render(
      <RightDock
        open={true}
        onOpenChange={vi.fn()}
        renderProps={renderProps}
        visibilityOptions={{
          experimentalFeatures: {
            insights: true,
            memoryView: true,
            devServerView: true,
            researchView: true,
            evalsView: true,
            goalsView: true,
          },
          showSkillsTab: true,
          todosEnabled: true,
        }}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("data-testid"))).toEqual(toolTabIds);
    expect(screen.getByTestId("right-dock-tab-usage")).toHaveAttribute("aria-label", "Activity");
    expect(screen.getByTestId("right-dock-tab-activity-log")).toHaveAttribute("aria-label", "Activity Log");
    expect(screen.getByTestId("right-dock-tab-github-import")).toHaveAttribute("aria-label", "Import from GitHub");
    expect(screen.getByTestId("right-dock-tab-git-manager")).toHaveAttribute("aria-label", "Git Manager");
    expect(screen.getByTestId("right-dock-tab-files")).toHaveAttribute("aria-label", "Files");
    expect(screen.getByTestId("right-dock-tab-automation")).toHaveAttribute("aria-label", "Automation");
    for (const removedId of removedViewTabIds) {
      expect(screen.queryByTestId(removedId)).toBeNull();
    }
  });

  it("clicking action tabs invokes handlers without replacing the inline Files body", () => {
    const onOpenUsage = vi.fn();
    const onOpenActivityLog = vi.fn();
    const onOpenGitHubImport = vi.fn();
    const onOpenGitManager = vi.fn();
    const onOpenSchedules = vi.fn();
    render(
      <RightDock
        open={true}
        onOpenChange={vi.fn()}
        renderProps={{
          ...renderProps,
          onOpenUsage,
          onOpenActivityLog,
          onOpenGitHubImport,
          onOpenGitManager,
          onOpenSchedules,
        }}
      />,
    );

    const actionAssertions: Array<[string, () => void, unknown[]]> = [
      ["right-dock-tab-usage", onOpenUsage, [null]],
      ["right-dock-tab-activity-log", onOpenActivityLog, []],
      ["right-dock-tab-github-import", onOpenGitHubImport, []],
      ["right-dock-tab-git-manager", onOpenGitManager, []],
      ["right-dock-tab-automation", onOpenSchedules, []],
    ];

    for (const [tabId, handler, args] of actionAssertions) {
      fireEvent.click(screen.getByTestId(tabId));
      expect(handler).toHaveBeenCalledWith(...args);
      expect(screen.getByTestId("right-dock-files-view")).toBeInTheDocument();
      expect(screen.getByTestId("right-dock-tab-files")).toHaveAttribute("aria-selected", "true");
    }

    fireEvent.click(screen.getByTestId("right-dock-tab-files"));
    expect(screen.getByTestId("right-dock-files-view")).toBeInTheDocument();
  });

  it("closes internally and clamps then persists resize width", () => {
    const onOpenChange = vi.fn();
    render(<RightDock open={true} onOpenChange={onOpenChange} renderProps={renderProps} />);

    fireEvent.click(screen.getByTestId("right-dock-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.localStorage.getItem(RIGHT_DOCK_OPEN_STORAGE_KEY)).toBe("false");

    const handle = screen.getByTestId("right-dock-resize-handle");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 900 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 0 });
    expect(window.localStorage.getItem(RIGHT_DOCK_WIDTH_STORAGE_KEY)).toBe("720");

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(window.localStorage.getItem(RIGHT_DOCK_WIDTH_STORAGE_KEY)).toBe("672");
  });

  it("restores persisted width on mount", () => {
    window.localStorage.setItem(RIGHT_DOCK_WIDTH_STORAGE_KEY, "400");
    render(<RightDock open={true} onOpenChange={vi.fn()} renderProps={renderProps} />);

    expect(screen.getByTestId("right-dock")).toHaveStyle({ width: "400px" });
    expect(screen.getByTestId("right-dock-resize-handle")).toHaveAttribute("aria-valuenow", "400");
  });

  it("renders the expanded modal through the same registry and restores focus on close", async () => {
    const onClose = vi.fn();
    const focusButton = document.createElement("button");
    document.body.appendChild(focusButton);
    const focusSpy = vi.spyOn(focusButton, "focus");

    render(
      <RightDockExpandModal
        viewKey="files"
        renderProps={renderProps}
        onClose={onClose}
        returnFocusRef={{ current: focusButton }}
      />,
    );

    expect(screen.getByTestId("right-dock-expand-modal")).toBeInTheDocument();
    expect(screen.getByTestId("right-dock-expand-body")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("right-dock-expand-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(focusSpy).toHaveBeenCalled();
    focusButton.remove();
  });

  it("does not render the expanded modal for action entries", () => {
    render(
      <RightDockExpandModal
        viewKey="automation"
        renderProps={renderProps}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("right-dock-expand-modal")).toBeNull();
  });

  it("restores the expanded modal's persisted size", () => {
    window.localStorage.setItem("fusion:right-dock-expand-modal-size", JSON.stringify({ width: 640, height: 480 }));
    render(
      <RightDockExpandModal
        viewKey="files"
        renderProps={renderProps}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("right-dock-expand-modal").querySelector(".right-dock-expand-modal")).toHaveStyle({
      width: "640px",
      height: "480px",
    });
  });

  it("fires expand for the selected inline entry only", () => {
    const onExpand = vi.fn();
    render(<RightDock open={true} onOpenChange={vi.fn()} renderProps={renderProps} onExpand={onExpand} />);
    fireEvent.click(screen.getByTestId("right-dock-tab-automation"));
    fireEvent.click(screen.getByTestId("right-dock-expand"));
    expect(onExpand).toHaveBeenCalledWith("files");
  });
});
