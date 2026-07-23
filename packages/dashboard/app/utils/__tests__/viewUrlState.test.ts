import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSettingsSectionFromUrl,
  getViewFromUrl,
  replaceViewInUrl,
} from "../viewUrlState";

describe("viewUrlState", () => {
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", originalUrl || "/");
  });

  it("reads view and Settings section params", () => {
    window.history.replaceState({}, "", "/?view=settings&section=merge");

    expect(getViewFromUrl()).toBe("settings");
    expect(getSettingsSectionFromUrl()).toBe("merge");
  });

  it("sets, replaces, and deletes the view param", () => {
    window.history.replaceState({}, "", "/?view=board");

    replaceViewInUrl("list");
    expect(window.location.search).toBe("?view=list");

    replaceViewInUrl(null);
    expect(window.location.search).toBe("");
  });

  it("writes section only for Settings and strips it from other views", () => {
    replaceViewInUrl("settings", "merge");
    expect(window.location.search).toBe("?view=settings&section=merge");

    replaceViewInUrl("board", "worktrees");
    expect(window.location.search).toBe("?view=board");
  });

  it("preserves the current Settings section when section is omitted", () => {
    window.history.replaceState({}, "", "/?view=settings&section=authentication");

    replaceViewInUrl("settings");

    expect(window.location.search).toBe("?view=settings&section=authentication");
  });

  it("preserves unrelated params, hash, and history state", () => {
    const state = { navIndex: 4, existing: "value" };
    window.history.replaceState(
      state,
      "",
      "/dashboard?project=proj_1&task=KB-005&pr=12&token=secret&view=board#details",
    );

    replaceViewInUrl("settings", "project-models");

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe(
      "?project=proj_1&task=KB-005&pr=12&token=secret&view=settings&section=project-models",
    );
    expect(window.location.hash).toBe("#details");
    expect(window.history.state).toEqual(state);
  });

  it("does not replace history when the owned params are identical", () => {
    window.history.replaceState({ navIndex: 1 }, "", "/?project=proj_1&view=settings&section=merge#settings");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    replaceViewInUrl("settings", "merge");

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
