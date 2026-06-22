import { describe, expect, it } from "vitest";
import { getVisibleOverflowViewEntries, STATIC_OVERFLOW_VIEW_ENTRIES } from "../overflowViewRegistry";
import type { PluginDashboardViewEntry } from "../../api";

describe("overflowViewRegistry", () => {
  it("exposes exactly the six static right-dock tool destinations", () => {
    const entries = getVisibleOverflowViewEntries();
    const keys = entries.map((entry) => entry.key);

    expect(keys).toEqual(["usage", "activity-log", "github-import", "git-manager", "files", "automation"]);
    expect(entries.map((entry) => entry.label)).toEqual([
      "Activity",
      "Activity Log",
      "Import from GitHub",
      "Git Manager",
      "Files",
      "Automation",
    ]);
    expect(entries.filter((entry) => entry.render).map((entry) => entry.key)).toEqual(["files"]);
    expect(entries.filter((entry) => entry.onActivate).map((entry) => entry.key)).toEqual([
      "usage",
      "activity-log",
      "github-import",
      "git-manager",
      "automation",
    ]);
  });

  it("does not expose left-sidebar content views in the right-dock registry", () => {
    const removedKeys = [
      "documents",
      "research",
      "insights",
      "skills",
      "memory",
      "secrets",
      "stash-recovery",
      "evals",
      "goalsView",
      "todos",
      "devserver",
    ];
    const keys = getVisibleOverflowViewEntries({
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
    }).map((entry) => entry.key);

    expect(keys).toEqual(STATIC_OVERFLOW_VIEW_ENTRIES.map((entry) => entry.key));
    for (const removedKey of removedKeys) {
      expect(keys).not.toContain(removedKey);
    }
  });

  it("adds only non-primary plugin views after static tool entries", () => {
    const pluginDashboardViews: PluginDashboardViewEntry[] = [
      {
        pluginId: "plugin-a",
        view: { viewId: "primary", label: "Primary", placement: "primary" },
      },
      {
        pluginId: "plugin-a",
        view: { viewId: "tools", label: "Tools", placement: "overflow", order: 2 },
      },
      {
        pluginId: "plugin-b",
        view: { viewId: "audit", label: "Audit", placement: "secondary", order: 1 },
      },
    ];

    const entries = getVisibleOverflowViewEntries({ pluginDashboardViews });
    expect(entries.map((entry) => entry.key)).toEqual([
      "usage",
      "activity-log",
      "github-import",
      "git-manager",
      "files",
      "automation",
      "plugin:plugin-b:audit",
      "plugin:plugin-a:tools",
    ]);
    expect(entries.some((entry) => entry.key === "plugin:plugin-a:primary")).toBe(false);
  });
});
