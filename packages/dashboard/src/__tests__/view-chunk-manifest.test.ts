import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  VIEW_SOURCE_MAP,
  loadViewChunkManifest,
  resetViewChunkManifestCache,
} from "../view-chunk-manifest";

function makeClientDir(name: string): string {
  return join(tmpdir(), `fn-4782-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

afterEach(() => {
  resetViewChunkManifestCache();
});

describe("view chunk manifest", () => {
  it("resolves hashed chunk paths", () => {
    const clientDir = makeClientDir("resolve");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    writeFileSync(
      join(clientDir, ".vite", "manifest.json"),
      JSON.stringify({
        [VIEW_SOURCE_MAP.agents]: { file: "assets/AgentsView-abc123.js" },
        [VIEW_SOURCE_MAP.chat]: { file: "assets/ChatView-def456.js" },
      }),
    );

    const map = loadViewChunkManifest(clientDir);
    expect(map.agents).toBe("/assets/AgentsView-abc123.js");
    expect(map.chat).toBe("/assets/ChatView-def456.js");

    rmSync(clientDir, { recursive: true, force: true });
  });

  it("returns empty map when manifest file is missing", () => {
    const clientDir = makeClientDir("missing");
    mkdirSync(clientDir, { recursive: true });

    const map = loadViewChunkManifest(clientDir);
    expect(map).toEqual({});

    rmSync(clientDir, { recursive: true, force: true });
  });

  it("returns partial map when source entry is absent", () => {
    const clientDir = makeClientDir("partial");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    writeFileSync(
      join(clientDir, ".vite", "manifest.json"),
      JSON.stringify({
        [VIEW_SOURCE_MAP.agents]: { file: "assets/AgentsView-abc123.js" },
      }),
    );

    const map = loadViewChunkManifest(clientDir);
    expect(map.agents).toBe("/assets/AgentsView-abc123.js");
    expect(map.chat).toBeUndefined();

    rmSync(clientDir, { recursive: true, force: true });
  });

  it("cache is invalidated by reset", () => {
    const clientDir = makeClientDir("cache");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    const manifestPath = join(clientDir, ".vite", "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        [VIEW_SOURCE_MAP.agents]: { file: "assets/AgentsView-old.js" },
      }),
    );

    const first = loadViewChunkManifest(clientDir);
    expect(first.agents).toBe("/assets/AgentsView-old.js");

    resetViewChunkManifestCache();
    writeFileSync(
      manifestPath,
      JSON.stringify({
        [VIEW_SOURCE_MAP.agents]: { file: "assets/AgentsView-new.js" },
      }),
    );
    const refreshed = loadViewChunkManifest(clientDir);
    expect(refreshed.agents).toBe("/assets/AgentsView-new.js");

    rmSync(clientDir, { recursive: true, force: true });
  });

  it("cache auto-invalidates when manifest mtime changes", () => {
    const clientDir = makeClientDir("mtime");
    mkdirSync(join(clientDir, ".vite"), { recursive: true });
    const manifestPath = join(clientDir, ".vite", "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        [VIEW_SOURCE_MAP.agents]: { file: "assets/AgentsView-old.js" },
      }),
    );

    const first = loadViewChunkManifest(clientDir);
    expect(first.agents).toBe("/assets/AgentsView-old.js");

    writeFileSync(
      manifestPath,
      JSON.stringify({
        [VIEW_SOURCE_MAP.agents]: { file: "assets/AgentsView-new.js" },
      }),
    );
    // Force a distinctly newer mtime so the cache key changes even on
    // coarse-grained filesystems.
    const future = new Date(Date.now() + 5_000);
    utimesSync(manifestPath, future, future);

    const refreshed = loadViewChunkManifest(clientDir);
    expect(refreshed.agents).toBe("/assets/AgentsView-new.js");

    rmSync(clientDir, { recursive: true, force: true });
  });
});
