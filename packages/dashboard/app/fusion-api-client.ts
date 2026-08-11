import { withTokenHeader } from "./auth";

/*
FNXC:FrontendPluginApi 2026-08-11-11:28:
This intentional external integrator API is Slice 2, DashboardApiClient, of upstream's 2026-07-01 theme-plugin proposal and origin tracker Tchori-Labs/Fusion#6. Its concrete endpoint allow-list prevents a page-held daemon token from becoming an arbitrary same-origin API capability; this is not a generic fetch surface.

Read the token through withTokenHeader for every call rather than duplicating capture or storage, so rotation and daemon-auth recovery continue through the live auth fetch wrapper. Do not stamp the dashboard-ui identity header: these calls belong to external integrators, not operator UI clicks.
*/
export const FUSION_API_ALLOWED_ENDPOINTS = [
  { method: "GET", path: "/api/views" },
  { method: "GET", path: "/api/settings/sections" },
] as const;

type FusionApiAllowedEndpoint = (typeof FUSION_API_ALLOWED_ENDPOINTS)[number];

export interface FusionApiView {
  id: string;
  label: string;
  labelKey?: string;
  aliases?: string[];
  internal?: true;
}

export interface FusionApiViewsResponse {
  views: FusionApiView[];
}

export interface FusionApiSettingsSection {
  id: string;
  label: string;
  labelKey: string;
  scope: "global" | "project" | null;
  group: string;
  keywords: string[];
  searchableKeys: string[];
  advanced: boolean;
}

export interface FusionApiSettingsSectionsResponse {
  sections: FusionApiSettingsSection[];
}

export interface FusionDashboardApi {
  getViews(init?: { signal?: AbortSignal }): Promise<FusionApiViewsResponse>;
  getSettingsSections(init?: { signal?: AbortSignal }): Promise<FusionApiSettingsSectionsResponse>;
}

function documentedScope(): string {
  return FUSION_API_ALLOWED_ENDPOINTS.map(({ method, path }) => `${method} ${path}`).join(", ");
}

/** Reject every request outside the stable external-integration endpoint contract before fetch can run. */
export function assertAllowedFusionApiEndpoint(method: string, path: string): void {
  const origin = window.location.origin;
  const resolved = new URL(path, origin);
  const isAllowed = resolved.origin === origin
    && FUSION_API_ALLOWED_ENDPOINTS.some((endpoint) => endpoint.method === method && endpoint.path === resolved.pathname);

  if (!isAllowed) {
    throw new TypeError(
      `Fusion API endpoint ${method} ${path} is outside the documented scope: ${documentedScope()}.`,
    );
  }
}

async function getJson<T>(path: FusionApiAllowedEndpoint["path"], signal?: AbortSignal): Promise<T> {
  assertAllowedFusionApiEndpoint("GET", path);

  // Read window.fetch at dispatch time so installAuthFetch() remains the one auth-recovery wrapper.
  const response = await window.fetch(path, {
    method: "GET",
    signal,
    headers: withTokenHeader(),
  });

  if (!response.ok) {
    throw new Error(`Fusion API request failed for ${path}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `Fusion API returned ${contentType || "an unknown content type"} instead of JSON for ${path}. `
      + `(${response.status} ${response.statusText})`,
    );
  }

  try {
    return await response.json() as T;
  } catch {
    throw new Error(`Fusion API returned invalid JSON for ${path}. (${response.status} ${response.statusText})`);
  }
}

export function createFusionApiClient(): FusionDashboardApi {
  return {
    getViews: (init) => getJson<FusionApiViewsResponse>("/api/views", init?.signal),
    getSettingsSections: (init) => getJson<FusionApiSettingsSectionsResponse>("/api/settings/sections", init?.signal),
  };
}
