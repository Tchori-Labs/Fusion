import { describe, expect, it } from "vitest";
import {
  decideExecutionPlan,
  normalizeForwardedArgs,
  resolveAffectedPackages,
  shouldForceFullSuite,
} from "../../../../scripts/test-changed.mjs";
import { parseShardArgs, planShardAssignments, selectShardPackages, expandVirtualPackages } from "../../../../scripts/ci-test-shard.mjs";

describe("root test command changed-only planning", () => {
  it("uses changed mode when package-only changes are detected", () => {
    const packageMap = new Map([
      ["packages/core", "@fusion/core"],
      ["packages/engine", "@fusion/engine"],
    ]);

    const plan = decideExecutionPlan({
      forceFullSuite: false,
      comparisonBase: "abc123",
      changedFiles: ["packages/core/src/store.ts", "packages/engine/src/index.ts"],
      packageNameByDir: packageMap,
    });

    expect(plan).toEqual({ mode: "changed", packages: ["@fusion/core", "@fusion/engine"] });
  });

  it("falls back to full suite when shared test infra changes", () => {
    const plan = decideExecutionPlan({
      forceFullSuite: false,
      comparisonBase: "abc123",
      changedFiles: ["scripts/test-with-lock.mjs"],
      packageNameByDir: new Map([["packages/core", "@fusion/core"]]),
    });

    expect(plan).toEqual({ mode: "full", reason: "shared-infra-changed" });
  });

  it("falls back to full suite when comparison base cannot be resolved", () => {
    const plan = decideExecutionPlan({
      forceFullSuite: false,
      comparisonBase: null,
      changedFiles: null,
      packageNameByDir: new Map(),
    });

    expect(plan).toEqual({ mode: "full", reason: "missing-comparison-base" });
  });

  it("treats unknown package directories as full-suite fallback", () => {
    const resolved = resolveAffectedPackages(["packages/unknown/src/index.ts"], new Map());
    expect(resolved).toBeNull();
  });

  it("marks root workflow/config changes as full-suite triggers", () => {
    expect(shouldForceFullSuite([".github/workflows/ci.yml"])).toBe(true);
    expect(shouldForceFullSuite(["package.json"])).toBe(true);
    expect(shouldForceFullSuite(["packages/core/src/store.ts"])).toBe(false);
  });

  it("strips forwarded silent flags so package vitest scripts do not receive duplicates", () => {
    expect(
      normalizeForwardedArgs(["--full", "--silent", "--silent=passed-only", "--reporter=dot"]),
    ).toEqual(["--reporter=dot"]);
  });
});

describe("CI shard test planner", () => {
  it("parses valid shard args", () => {
    expect(parseShardArgs(["--shard", "2", "--total", "3"], {} as NodeJS.ProcessEnv)).toEqual({
      shard: 2,
      total: 3,
    });
  });

  it("rejects invalid shard args", () => {
    expect(() => parseShardArgs(["--shard", "4", "--total", "3"], {} as NodeJS.ProcessEnv)).toThrow(
      "Usage: node scripts/ci-test-shard.mjs --shard <1..N> --total <N>",
    );
  });

  it("deterministically balances weighted packages across shards", () => {
    const weightedPackages = [
      { name: "@fusion/dashboard", testFileCount: 140 },
      { name: "@fusion/engine", testFileCount: 120 },
      { name: "@fusion/core", testFileCount: 60 },
      { name: "@runfusion/fusion", testFileCount: 40 },
      { name: "@fusion/plugin-sdk", testFileCount: 18 },
      { name: "@fusion/mobile", testFileCount: 12 },
      { name: "@fusion/desktop", testFileCount: 8 },
      { name: "@fusion/dashboard-utils", testFileCount: 4 },
      { name: "@fusion/no-tests-yet", testFileCount: 0 },
    ];

    // Dashboard (140) exceeds avg threshold (ceil(402/3)=134) so it gets split
    // into 2 virtual entries of 70 each, dispatched with vitest --shard.
    const shardAssignments = planShardAssignments(weightedPackages, 3);

    // Verify selectShardPackages returns matching slices
    expect(selectShardPackages(weightedPackages, 1, 3)).toEqual(shardAssignments[0]);
    expect(selectShardPackages(weightedPackages, 2, 3)).toEqual(shardAssignments[1]);
    expect(selectShardPackages(weightedPackages, 3, 3)).toEqual(shardAssignments[2]);

    // Verify shard weights are balanced within 15% of mean
    const shardWeights = shardAssignments.map((shardEntries) =>
      shardEntries.reduce((sum, entry) => sum + (entry as { weight: number }).weight, 0),
    );

    const totalWeight = weightedPackages.reduce((sum, pkg) => sum + pkg.testFileCount, 0);
    const mean = totalWeight / 3;

    expect(Math.max(...shardWeights)).toBeLessThanOrEqual(mean * 1.15);
    expect(Math.min(...shardWeights)).toBeGreaterThanOrEqual(mean * 0.85);

    // Verify dashboard was split across 2 shards and engine is on a different shard
    const dashboardShards = shardAssignments.filter((shard) =>
      shard.some((e) => (e as { name: string }).name === "@fusion/dashboard"),
    );
    const engineShard = shardAssignments.findIndex((shard) =>
      shard.some((e) => (e as { name: string }).name === "@fusion/engine"),
    );
    expect(dashboardShards.length).toBe(2); // split into 2 virtual entries
    expect(engineShard).toBeGreaterThanOrEqual(0);

    // Verify virtual entries carry vitest shard metadata
    const virtualEntries = shardAssignments
      .flat()
      .filter((e) => (e as { vitestShardCount?: number }).vitestShardCount);
    expect(virtualEntries.length).toBe(2);
    for (const entry of virtualEntries) {
      const e = entry as { name: string; vitestShardIndex: number; vitestShardCount: number };
      expect(e.name).toBe("@fusion/dashboard");
      expect(e.vitestShardCount).toBe(2);
      expect(e.vitestShardIndex).toBeGreaterThanOrEqual(1);
      expect(e.vitestShardIndex).toBeLessThanOrEqual(2);
    }
  });
});

describe("expandVirtualPackages", () => {
  it("passes through packages below threshold as plain entries", () => {
    const pkgs = [
      { name: "small", testFileCount: 10 },
      { name: "tiny", testFileCount: 3 },
    ];
    const result = expandVirtualPackages(pkgs, 50);
    expect(result).toEqual([
      { name: "small", weight: 10 },
      { name: "tiny", weight: 3 },
    ]);
  });

  it("splits oversized package into evenly-weighted virtual entries", () => {
    const pkgs = [{ name: "big", testFileCount: 100 }];
    const result = expandVirtualPackages(pkgs, 30);
    // ceil(100/30) = 4 entries, floor(100/4)=25, remainder=0
    expect(result).toHaveLength(4);
    for (const entry of result) {
      expect(entry.name).toBe("big");
      expect(entry.weight).toBe(25);
      expect(entry.vitestShardCount).toBe(4);
    }
    expect(result.map((e) => e.vitestShardIndex)).toEqual([1, 2, 3, 4]);
  });

  it("distributes remainder to first entries when weight is not evenly divisible", () => {
    const pkgs = [{ name: "odd", testFileCount: 10 }];
    const result = expandVirtualPackages(pkgs, 4);
    // ceil(10/4) = 3 entries, floor(10/3)=3, remainder=1
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.weight)).toEqual([4, 3, 3]);
    expect(result.map((e) => e.vitestShardIndex)).toEqual([1, 2, 3]);
    expect(result.every((e) => e.vitestShardCount === 3)).toBe(true);
  });

  it("returns plain entry when testFileCount equals threshold exactly", () => {
    const pkgs = [{ name: "exact", testFileCount: 50 }];
    const result = expandVirtualPackages(pkgs, 50);
    expect(result).toEqual([{ name: "exact", weight: 50 }]);
  });

  it("handles zero testFileCount without splitting", () => {
    const pkgs = [{ name: "empty", testFileCount: 0 }];
    const result = expandVirtualPackages(pkgs, 10);
    expect(result).toEqual([{ name: "empty", weight: 0 }]);
  });

  it("defaults to no splitting when threshold is Infinity", () => {
    const pkgs = [{ name: "huge", testFileCount: 9999 }];
    const result = expandVirtualPackages(pkgs);
    expect(result).toEqual([{ name: "huge", weight: 9999 }]);
  });
});
