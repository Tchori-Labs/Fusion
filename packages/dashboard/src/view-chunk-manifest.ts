import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type TaskViewId = string;

type ManifestEntry = {
  file?: string;
};

type ViteManifest = Record<string, ManifestEntry>;

// Canonical taskView ids that map to lazy React views in App.tsx.
// Intentionally excluded:
// - nodes: opened by overlay state, not taskView routing
// - todo: lazy import exists but not a valid BuiltInTaskView route
// - board/list/graph/missions/mailbox: non-lazy views
export const VIEW_SOURCE_MAP: Record<TaskViewId, string> = {
  agents: "components/AgentsView.tsx",
  chat: "components/ChatView.tsx",
  documents: "components/DocumentsView.tsx",
  research: "components/ResearchView.tsx",
  evals: "components/EvalsView.tsx",
  skills: "components/SkillsView.tsx",
  memory: "components/MemoryView.tsx",
  insights: "components/InsightsView.tsx",
  reliability: "components/ReliabilityView.tsx",
  "dev-server": "components/DevServerView.tsx",
  goalsView: "components/GoalsView.tsx",
  "stash-recovery": "components/StashRecoveryView.tsx",
};

type ManifestCacheEntry = {
  entries: Record<TaskViewId, string>;
  mtimeMs: number | null;
};

const manifestCache = new Map<string, ManifestCacheEntry>();
const warnedMissingManifest = new Set<string>();
const warnedMissingEntries = new Set<string>();

function warnOnce(set: Set<string>, key: string, message: string): void {
  if (set.has(key)) {
    return;
  }
  set.add(key);
  console.warn(message);
}

export function loadViewChunkManifest(clientDir: string): Record<TaskViewId, string> {
  const cacheKey = resolve(clientDir);
  const manifestPath = join(cacheKey, ".vite", "manifest.json");

  // Stat first so a release-upgrade that replaces the manifest invalidates
  // the cache automatically. Without this, the server keeps handing out
  // stale chunk paths and the browser 404s on every lazy view until restart.
  let mtimeMs: number | null = null;
  try {
    mtimeMs = statSync(manifestPath).mtimeMs;
  } catch {
    mtimeMs = null;
  }

  const cached = manifestCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.entries;
  }

  if (!existsSync(manifestPath)) {
    warnOnce(warnedMissingManifest, cacheKey, `[dashboard] View chunk manifest missing: ${manifestPath}`);
    const empty: Record<TaskViewId, string> = {};
    manifestCache.set(cacheKey, { entries: empty, mtimeMs });
    return empty;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest;
    const resolvedEntries: Record<TaskViewId, string> = {};

    for (const [viewId, sourcePath] of Object.entries(VIEW_SOURCE_MAP)) {
      const entry = manifest[sourcePath];
      if (!entry?.file) {
        warnOnce(
          warnedMissingEntries,
          `${cacheKey}:${viewId}`,
          `[dashboard] View chunk manifest entry missing: ${sourcePath} (${viewId})`,
        );
        continue;
      }
      resolvedEntries[viewId] = `/${entry.file}`;
    }

    manifestCache.set(cacheKey, { entries: resolvedEntries, mtimeMs });
    return resolvedEntries;
  } catch {
    warnOnce(warnedMissingManifest, `${cacheKey}:parse`, `[dashboard] Failed to parse view chunk manifest: ${manifestPath}`);
    const empty: Record<TaskViewId, string> = {};
    manifestCache.set(cacheKey, { entries: empty, mtimeMs });
    return empty;
  }
}

export function resetViewChunkManifestCache(): void {
  manifestCache.clear();
  warnedMissingManifest.clear();
  warnedMissingEntries.clear();
}
