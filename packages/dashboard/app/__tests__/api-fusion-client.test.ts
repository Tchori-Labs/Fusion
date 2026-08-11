import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadClientModule() {
  vi.resetModules();
  return import("../fusion-api-client");
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("window.fusion.api", () => {
  const originalFetch = window.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    window.fetch = originalFetch;
    delete (window as Window & { __fnAuthFetchInstalled?: boolean }).__fnAuthFetchInstalled;
    delete window.__fusionApiClientInstalled;
    delete window.fusion;
    delete (window as Window & { fusionShell?: unknown }).fusionShell;
    delete (window as Window & { fusionAPI?: unknown }).fusionAPI;
  });

  it("uses the stored bearer token with and without the auth fetch wrapper", async () => {
    window.localStorage.setItem("fn.authToken", "daemon-token");
    const fetchSpy = vi.fn(async () => jsonResponse({ views: [{ id: "board", label: "Board" }] }));
    window.fetch = fetchSpy as unknown as typeof window.fetch;

    const { createFusionApiClient } = await loadClientModule();
    const directClient = createFusionApiClient();
    await expect(directClient.getViews()).resolves.toEqual({ views: [{ id: "board", label: "Board" }] });
    expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer daemon-token");

    const { installAuthFetch } = await import("../auth");
    installAuthFetch();
    const wrappedClient = createFusionApiClient();
    await wrappedClient.getViews();
    expect(new Headers(fetchSpy.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe("Bearer daemon-token");
  });

  it("dispatches without Authorization when no dashboard token exists", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ views: [] }));
    window.fetch = fetchSpy as unknown as typeof window.fetch;

    const { createFusionApiClient } = await loadClientModule();
    await expect(createFusionApiClient().getViews()).resolves.toEqual({ views: [] });

    expect(fetchSpy).toHaveBeenCalledWith("/api/views", expect.objectContaining({ method: "GET" }));
    expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
  });

  it("reads token rotation for each request", async () => {
    window.localStorage.setItem("fn.authToken", "original-token");
    const fetchSpy = vi.fn(async () => jsonResponse({ sections: [] }));
    window.fetch = fetchSpy as unknown as typeof window.fetch;

    const { createFusionApiClient } = await loadClientModule();
    const { setAuthToken } = await import("../auth");
    const client = createFusionApiClient();
    await client.getSettingsSections();
    setAuthToken("replacement-token");
    await client.getSettingsSections();

    expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer original-token");
    expect(new Headers(fetchSpy.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe("Bearer replacement-token");
  });

  it("preserves daemon-auth recovery through the installed auth fetch wrapper", async () => {
    window.localStorage.setItem("fn.authToken", "stale-token");
    window.fetch = vi.fn(async () => jsonResponse(
      { error: "Unauthorized", message: "Valid bearer token required" },
      401,
    )) as unknown as typeof window.fetch;

    const { createFusionApiClient } = await loadClientModule();
    const { AUTH_TOKEN_RECOVERY_REQUIRED_EVENT, installAuthFetch } = await import("../auth");
    installAuthFetch();
    const eventHandler = vi.fn();
    window.addEventListener(AUTH_TOKEN_RECOVERY_REQUIRED_EVENT, eventHandler);

    await expect(createFusionApiClient().getViews()).rejects.toThrow("/api/views: 401");
    await vi.waitFor(() => expect(eventHandler).toHaveBeenCalledTimes(1));

    window.removeEventListener(AUTH_TOKEN_RECOVERY_REQUIRED_EVENT, eventHandler);
  });

  it("installs once without replacing fetch or stacking requests", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ views: [] }));
    window.fetch = fetchSpy as unknown as typeof window.fetch;
    const fetchBeforeInstall = window.fetch;
    const { installFusionApiClient } = await loadClientModule();

    installFusionApiClient();
    const firstApi = window.fusion?.api;
    installFusionApiClient();

    expect(window.fusion?.api).toBe(firstApi);
    expect(window.fetch).toBe(fetchBeforeInstall);
    await firstApi?.getViews();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("merges with unrelated Fusion and desktop bridge globals", async () => {
    const integrationWindow = window as unknown as {
      fusion?: { retained: boolean };
      fusionShell?: { kind: string };
      fusionAPI?: { openExternal: () => void };
    };
    integrationWindow.fusion = { retained: true };
    integrationWindow.fusionShell = { kind: "shell" };
    const desktopBridge = { openExternal: () => undefined };
    integrationWindow.fusionAPI = desktopBridge;

    const { installFusionApiClient } = await loadClientModule();
    installFusionApiClient();

    expect(window.fusion).toMatchObject({ retained: true });
    expect(integrationWindow.fusionShell).toEqual({ kind: "shell" });
    expect(integrationWindow.fusionAPI).toBe(desktopBridge);
  });

  it("is safe outside a browser and with a non-writable integration namespace", async () => {
    const { installFusionApiClient } = await loadClientModule();
    vi.stubGlobal("window", undefined);
    expect(() => installFusionApiClient()).not.toThrow();
    vi.unstubAllGlobals();

    Object.defineProperty(window, "fusion", { configurable: true, value: {}, writable: false });
    expect(() => installFusionApiClient()).not.toThrow();
  });

  it("rejects every endpoint outside its documented GET scope before fetch", async () => {
    const fetchSpy = vi.fn();
    window.fetch = fetchSpy as unknown as typeof window.fetch;
    const { assertAllowedFusionApiEndpoint } = await loadClientModule();

    expect(() => assertAllowedFusionApiEndpoint("GET", "/api/views")).not.toThrow();
    expect(() => assertAllowedFusionApiEndpoint("GET", "/api/settings/sections")).not.toThrow();
    for (const [method, path] of [
      ["GET", "/api/tasks"],
      ["POST", "/api/views"],
      ["GET", "/settings"],
      ["GET", "https://evil.example/api/views"],
      ["GET", "//evil.example/api/views"],
      ["GET", "/api/../secrets"],
    ]) {
      expect(() => assertAllowedFusionApiEndpoint(method, path)).toThrow(TypeError);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("publishes only named least-privilege methods", async () => {
    const { installFusionApiClient } = await loadClientModule();
    installFusionApiClient();

    expect(Object.keys(window.fusion?.api ?? {}).sort()).toEqual(["getSettingsSections", "getViews"]);
  });

  it("does not route existing dashboard code through the integration client", () => {
    const appRoot = resolve(__dirname, "..");
    const importers = sourceFiles(appRoot)
      .filter((file) => !file.includes("/__tests__/"))
      .filter((file) => /from ["'][^"']*fusion-api-client["']/.test(readFileSync(file, "utf-8")))
      .map((file) => file.replace(`${appRoot}/`, ""));

    expect(importers).toEqual(["main.tsx"]);
  });
});

describe("documented window.fusion.api scope contract", () => {
  const contractStart = "<!-- fusion-dashboard-api-client-contract:start -->";
  const contractEnd = "<!-- fusion-dashboard-api-client-contract:end -->";

  it("keeps documented endpoints and client methods equal to the public contract", async () => {
    const guide = readFileSync(resolve(__dirname, "../../../../docs/PLUGIN_AUTHORING.md"), "utf-8");
    const start = guide.indexOf(contractStart);
    const end = guide.indexOf(contractEnd);
    expect(start, "PLUGIN_AUTHORING.md is missing the dashboard API contract start marker").toBeGreaterThanOrEqual(0);
    expect(end, "PLUGIN_AUTHORING.md is missing the dashboard API contract end marker").toBeGreaterThan(start);

    const rows = [...guide.slice(start + contractStart.length, end).matchAll(
      /\| `([A-Z]+)` \| `([^`]+)` \| `([A-Za-z]+)\(\)` \|/g,
    )].map((match) => ({ method: match[1], path: match[2], clientMethod: match[3] }));
    const { FUSION_API_ALLOWED_ENDPOINTS, createFusionApiClient } = await loadClientModule();
    const documentedEndpoints = rows.map(({ method, path }) => ({ method, path }));
    const allowedEndpoints = FUSION_API_ALLOWED_ENDPOINTS.map(({ method, path }) => ({ method, path }));

    expect(documentedEndpoints).toEqual(allowedEndpoints);
    expect(allowedEndpoints).toEqual(documentedEndpoints);
    expect(rows.map(({ clientMethod }) => clientMethod).sort()).toEqual(Object.keys(createFusionApiClient()).sort());
    expect(Object.keys(createFusionApiClient()).sort()).toEqual(rows.map(({ clientMethod }) => clientMethod).sort());
  });
});
