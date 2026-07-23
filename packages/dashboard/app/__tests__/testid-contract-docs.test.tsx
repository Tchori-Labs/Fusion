/*
FNXC:TestidContract 2026-07-23-00:52:
The stable dashboard selector inventory is a compatibility contract for plugins and external test suites. This guard parses the published contract, compares settings ids in both directions, scans each owning component for its selector marker, and renders the inexpensive navigation/project surfaces so documentation cannot silently drift from the DOM.
*/
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_SECTIONS } from "../components/SettingsModal";
import { LeftSidebarNav } from "../components/LeftSidebarNav";
import { ProjectSelector } from "../components/ProjectSelector";
import type { ProjectInfo } from "../api";

const DOC_PATH = resolve(__dirname, "../../../../docs/dashboard-testid-contract.md");
const DASHBOARD_GUIDE_PATH = resolve(__dirname, "../../../../docs/dashboard-guide.md");
const PLUGIN_GUIDE_PATH = resolve(__dirname, "../../../../docs/PLUGIN_AUTHORING.md");

const COMPONENT_SOURCE = {
  settings: readFileSync(resolve(__dirname, "../components/SettingsModal.tsx"), "utf8"),
  sidebar: readFileSync(resolve(__dirname, "../components/LeftSidebarNav.tsx"), "utf8"),
  projectSelector: readFileSync(resolve(__dirname, "../components/ProjectSelector.tsx"), "utf8"),
  taskCard: readFileSync(resolve(__dirname, "../components/TaskCard.tsx"), "utf8"),
} as const;

const STATIC_SOURCE_MARKERS = new Map<string, string>([
  ["settings-mobile-section-select", COMPONENT_SOURCE.settings],
  ["left-sidebar-nav", COMPONENT_SOURCE.sidebar],
  ["sidebar-nav-new-task", COMPONENT_SOURCE.sidebar],
  ["sidebar-nav-settings", COMPONENT_SOURCE.sidebar],
  ["project-selector-trigger", COMPONENT_SOURCE.projectSelector],
  ["project-selector-dropdown", COMPONENT_SOURCE.projectSelector],
  ["project-selector-search-input", COMPONENT_SOURCE.projectSelector],
]);

const DYNAMIC_SOURCE_MARKERS = new Map<string, { source: string; marker: string }>([
  ["settings-section-<sectionId>", {
    source: COMPONENT_SOURCE.settings,
    marker: "data-testid={`settings-section-${section.id}`}",
  }],
  ["sidebar-nav-<viewId>", {
    source: COMPONENT_SOURCE.sidebar,
    marker: 'testId: "sidebar-nav-board"',
  }],
  ["sidebar-nav-plugin-<pluginId>-<viewId>", {
    source: COMPONENT_SOURCE.sidebar,
    marker: "testId: `sidebar-nav-plugin-${entry.pluginId}-${entry.view.viewId}`",
  }],
  ["project-selector-item-<projectId>", {
    source: COMPONENT_SOURCE.projectSelector,
    marker: "data-testid={`project-selector-item-${project.id}`}",
  }],
  ["task-card-<taskId>", {
    source: COMPONENT_SOURCE.taskCard,
    marker: "data-testid={`task-card-${task.id}`}",
  }],
]);

type ContractKind = "settings-section-id" | "static" | "dynamic";

type ParsedContract = Record<ContractKind, string[]>;

function parseContract(doc: string): ParsedContract {
  const match = doc.match(
    /<!-- stable-dashboard-testid-contract:start -->\s*```text\n([\s\S]*?)\n```\s*<!-- stable-dashboard-testid-contract:end -->/,
  );
  if (!match) {
    throw new Error("Stable dashboard testid contract block not found");
  }

  const parsed: ParsedContract = {
    "settings-section-id": [],
    static: [],
    dynamic: [],
  };
  for (const line of match[1].split("\n").map((value) => value.trim()).filter(Boolean)) {
    const separator = line.indexOf(":");
    const kind = line.slice(0, separator) as ContractKind;
    const value = line.slice(separator + 1);
    if (separator < 1 || !(kind in parsed) || !value) {
      throw new Error(`Malformed stable dashboard testid contract entry: ${line}`);
    }
    parsed[kind].push(value);
  }
  return parsed;
}

const contractDoc = readFileSync(DOC_PATH, "utf8");
const contract = parseContract(contractDoc);

function makeProject(id: string, name: string): ProjectInfo {
  return {
    id,
    name,
    path: `/workspace/${id}`,
    status: "active",
    isolationMode: "in-process",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

describe("stable dashboard data-testid contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("keeps the documented settings ids equal to every non-header SETTINGS_SECTIONS id", () => {
    const sourceIds = SETTINGS_SECTIONS
      .filter((section) => !section.isGroupHeader)
      .map((section) => section.id);

    expect(new Set(contract["settings-section-id"])).toEqual(new Set(sourceIds));
    expect(contract["settings-section-id"]).toHaveLength(sourceIds.length);
  });

  it("keeps every documented static and dynamic selector connected to its owning component", () => {
    expect(new Set(contract.static)).toEqual(new Set(STATIC_SOURCE_MARKERS.keys()));
    expect(new Set(contract.dynamic)).toEqual(new Set(DYNAMIC_SOURCE_MARKERS.keys()));

    for (const testId of contract.static) {
      expect(STATIC_SOURCE_MARKERS.get(testId), `${testId} has no owning component`).toContain(`"${testId}"`);
    }
    for (const pattern of contract.dynamic) {
      const owner = DYNAMIC_SOURCE_MARKERS.get(pattern);
      expect(owner, `${pattern} has no owning component`).toBeDefined();
      expect(owner?.source).toContain(owner?.marker);
    }
  });

  it("keeps both integration guides linked to the canonical contract page", () => {
    const expectedLink = "./dashboard-testid-contract.md";
    expect(readFileSync(DASHBOARD_GUIDE_PATH, "utf8")).toContain(expectedLink);
    expect(readFileSync(PLUGIN_GUIDE_PATH, "utf8")).toContain(expectedLink);
  });

  it("renders the contracted sidebar root, built-in action, plugin action, and footer actions", () => {
    render(
      <LeftSidebarNav
        view="board"
        onChangeView={vi.fn()}
        onNewTask={vi.fn()}
        onOpenSettings={vi.fn()}
        pluginDashboardViews={[{
          pluginId: "example-plugin",
          view: {
            viewId: "example-view",
            label: "Example",
            componentPath: "./Example",
          },
        }]}
      />,
    );

    expect(screen.getByTestId("left-sidebar-nav")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav-board")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav-plugin-example-plugin-example-view")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav-new-task")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav-settings")).toBeInTheDocument();
  });

  it("renders the contracted project selector ids", () => {
    const projects = [
      makeProject("project-current", "Current"),
      makeProject("project-target", "Target"),
    ];
    render(
      <ProjectSelector
        projects={projects}
        currentProject={projects[0]}
        onSelect={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("project-selector-trigger"));
    expect(screen.getByTestId("project-selector-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("project-selector-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("project-selector-item-project-target")).toBeInTheDocument();
  });
});
