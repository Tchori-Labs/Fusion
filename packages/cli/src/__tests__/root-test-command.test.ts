import { describe, expect, it } from "vitest";
import {
  decideExecutionPlan,
  normalizeForwardedArgs,
  resolveAffectedPackages,
  shouldForceFullSuite,
} from "../../../../scripts/test-changed.mjs";
import { parseShardArgs, planShardAssignments, selectShardPackages } from "../../../../scripts/ci-test-shard.mjs";

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

    const shardAssignments = planShardAssignments(weightedPackages, 3);
    expect(shardAssignments).toEqual([
      ["@fusion/dashboard"],
      ["@fusion/engine", "@fusion/desktop", "@fusion/dashboard-utils"],
      ["@fusion/core", "@runfusion/fusion", "@fusion/plugin-sdk", "@fusion/mobile", "@fusion/no-tests-yet"],
    ]);

    expect(selectShardPackages(weightedPackages, 1, 3)).toEqual(shardAssignments[0]);
    expect(selectShardPackages(weightedPackages, 2, 3)).toEqual(shardAssignments[1]);
    expect(selectShardPackages(weightedPackages, 3, 3)).toEqual(shardAssignments[2]);

    const weightsByName = new Map(weightedPackages.map((pkg) => [pkg.name, pkg.testFileCount]));
    const shardWeights = shardAssignments.map((shardPackages) =>
      shardPackages.reduce((sum, pkgName) => sum + (weightsByName.get(pkgName) ?? 0), 0),
    );

    const totalWeight = weightedPackages.reduce((sum, pkg) => sum + pkg.testFileCount, 0);
    const mean = totalWeight / 3;

    expect(Math.max(...shardWeights)).toBeLessThanOrEqual(mean * 1.15);
    expect(Math.min(...shardWeights)).toBeGreaterThanOrEqual(mean * 0.85);

    const dashboardShard = shardAssignments.findIndex((pkgs) => pkgs.includes("@fusion/dashboard"));
    const engineShard = shardAssignments.findIndex((pkgs) => pkgs.includes("@fusion/engine"));
    expect(dashboardShard).not.toBe(engineShard);
  });
});
