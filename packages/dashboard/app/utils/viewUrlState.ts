export function getViewFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("view");
}

export function getSettingsSectionFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("section");
}

/**
 * FNXC:DeepLink 2026-07-14-00:21:
 * This module exclusively owns the dashboard `view` and Settings `section` URL params. Project selection remains owned by projectUrlState.ts, task cleanup remains owned by useDeepLink.handleDetailClose, and every unrelated param (including pr, room, token, and shell-host params), hash fragment, and history-state value must pass through unchanged.
 */
export function replaceViewInUrl(view: string | null, section?: string | null): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (view && view.length > 0) {
    url.searchParams.set("view", view);
  } else {
    url.searchParams.delete("view");
  }

  if (view === "settings") {
    if (section !== undefined) {
      if (section && section.length > 0) {
        url.searchParams.set("section", section);
      } else {
        url.searchParams.delete("section");
      }
    }
  } else {
    url.searchParams.delete("section");
  }

  const query = url.searchParams.toString();
  const nextUrl = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;

  window.history.replaceState(window.history.state ?? {}, "", nextUrl);
}
