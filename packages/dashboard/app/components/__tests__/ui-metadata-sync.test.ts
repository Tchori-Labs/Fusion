import { describe, expect, it } from "vitest";
import {
  DASHBOARD_VIEW_IDS,
  DASHBOARD_VIEWS,
} from "../../../src/shared/dashboard-views";
import { SETTINGS_SECTION_METADATA } from "../../../src/shared/settings-sections";
import {
  buildSettingsSectionsPayload,
  buildViewsPayload,
} from "../../../src/routes/register-ui-metadata-routes";
import {
  ADVANCED_SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
} from "../SettingsModal";
import { BUILT_IN_TASK_VIEWS } from "../../hooks/useViewState";
import {
  EXCLUDED_RESET_SECTIONS,
  GLOBAL_SECTION_KEYS,
  PROJECT_SECTION_KEYS,
  getSectionKeyEntry,
} from "../settings/section-keys";

function uiComparable(section: (typeof SETTINGS_SECTIONS)[number]) {
  return {
    id: section.id,
    label: section.label,
    labelKey: section.labelKey,
    scope: section.scope,
    isGroupHeader: section.isGroupHeader,
    searchableText: section.searchableText,
    searchableKeys: section.searchableKeys,
  };
}

function metadataComparable(section: (typeof SETTINGS_SECTION_METADATA)[number]) {
  return {
    id: section.id,
    label: section.label,
    labelKey: section.labelKey,
    scope: section.scope,
    isGroupHeader: section.isGroupHeader,
    searchableText: section.searchableText,
    searchableKeys: section.searchableKeys,
  };
}

describe("shared UI metadata no-drift contract", () => {
  it("keeps Settings navigation and advanced visibility derived from metadata", () => {
    expect(SETTINGS_SECTIONS.map(uiComparable)).toEqual(SETTINGS_SECTION_METADATA.map(metadataComparable));
    expect([...ADVANCED_SETTINGS_SECTION_IDS]).toEqual(
      SETTINGS_SECTION_METADATA.filter((section) => section.advanced).map((section) => section.id),
    );
  });

  it("keeps persisted built-in views equal to canonical ids plus declared aliases", () => {
    const expectedViews = DASHBOARD_VIEWS.flatMap((view) => [...(view.aliases ?? []), view.id]);
    expect(BUILT_IN_TASK_VIEWS).toEqual(expectedViews);
    expect(DASHBOARD_VIEWS.map((view) => view.id)).toEqual(DASHBOARD_VIEW_IDS);
    expect(new Set(BUILT_IN_TASK_VIEWS).size).toBe(BUILT_IN_TASK_VIEWS.length);
  });

  it("keeps every settings reset-registry id backed by section metadata", () => {
    const metadataIds = new Set(SETTINGS_SECTION_METADATA.map((section) => section.id));
    const resetRegistryIds = new Set([
      ...Object.keys(GLOBAL_SECTION_KEYS),
      ...Object.keys(PROJECT_SECTION_KEYS),
      ...Object.keys(EXCLUDED_RESET_SECTIONS),
    ]);

    for (const sectionId of resetRegistryIds) {
      expect(metadataIds, `Missing Settings metadata for reset registry id ${sectionId}`).toContain(sectionId);
      if (!EXCLUDED_RESET_SECTIONS[sectionId]) {
        expect(getSectionKeyEntry(sectionId), `Missing reset entry for ${sectionId}`).not.toBeNull();
      }
    }
  });

  it("serves payloads built directly from the UI registries", () => {
    const viewsPayload = buildViewsPayload();
    const expectedViews = DASHBOARD_VIEWS.map((view) => ({
      id: view.id,
      label: view.label,
      labelKey: view.labelKey,
      ...(view.aliases ? { aliases: [...view.aliases] } : {}),
      ...(view.internal ? { internal: true } : {}),
    }));
    expect(viewsPayload.views).toEqual(expectedViews);
    expect(viewsPayload.views.map((view) => view.id)).toEqual(DASHBOARD_VIEW_IDS);

    const sectionsPayload = buildSettingsSectionsPayload();
    const selectableUiSections = SETTINGS_SECTIONS.filter((section) => !section.isGroupHeader);
    expect(sectionsPayload.sections.map((section) => section.id)).toEqual(
      selectableUiSections.map((section) => section.id),
    );
    for (const served of sectionsPayload.sections) {
      const source = SETTINGS_SECTION_METADATA.find((section) => section.id === served.id);
      expect(source).toBeDefined();
      expect(served).toEqual({
        id: source!.id,
        label: source!.label,
        labelKey: source!.labelKey,
        scope: source!.scope ?? null,
        group: source!.group,
        keywords: source!.searchableText ? [...source!.searchableText] : [],
        searchableKeys: source!.searchableKeys ? [...source!.searchableKeys] : [],
        advanced: source!.advanced,
      });
    }
  });
});
