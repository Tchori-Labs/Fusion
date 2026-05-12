#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTestArtifacts } from "./ensure-test-artifacts.mjs";
import { listWorkspacePackageInfos } from "./test-changed.mjs";

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function defaultTestWorkerBudget(env = process.env) {
  const cpuCap = Math.max(1, cpus().length - 1);
  const defaultTotal = Math.min(12, Math.max(4, cpuCap));
  const totalWorkers = parsePositiveInteger(env.FUSION_TEST_TOTAL_WORKERS) ?? defaultTotal;
  const concurrency = Math.max(
    1,
    Math.min(parsePositiveInteger(env.FUSION_TEST_CONCURRENCY) ?? 2, totalWorkers),
  );

  return { totalWorkers, concurrency };
}

export function parseShardArgs(argv = process.argv.slice(2), env = process.env) {
  const byFlag = (name) => {
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const shard = parsePositiveInteger(byFlag("--shard") ?? env.CI_SHARD_INDEX);
  const total = parsePositiveInteger(byFlag("--total") ?? env.CI_SHARD_TOTAL);

  if (!shard || !total || shard > total) {
    throw new Error("Usage: node scripts/ci-test-shard.mjs --shard <1..N> --total <N>");
  }

  return { shard, total };
}

export function countPackageTestFiles(packageDir, { projectRoot = process.cwd() } = {}) {
  const packageRoot = path.join(projectRoot, packageDir);
  return globSync("**/__tests__/**/*.test.{ts,tsx,mjs}", {
    cwd: packageRoot,
    nodir: true,
  }).length;
}

/**
 * Expand oversized packages into virtual entries that carry vitest --shard info.
 * A package whose testFileCount exceeds splitThreshold is divided into
 * ceil(testFileCount / splitThreshold) virtual entries, each with roughly
 * equal file counts and a vitestShardIndex/vitestShardCount pair.
 *
 * @param {Array<{name:string, testFileCount:number}>} packages
 * @param {number} splitThreshold - maximum weight before splitting (default: Infinity = no split)
 * @returns {Array<{name:string, weight:number, vitestShardIndex?:number, vitestShardCount?:number}>}
 */
export function expandVirtualPackages(packages, splitThreshold = Infinity) {
  const result = [];
  for (const pkg of packages) {
    if (pkg.testFileCount <= splitThreshold || splitThreshold <= 0) {
      result.push({ name: pkg.name, weight: pkg.testFileCount });
      continue;
    }
    const count = Math.ceil(pkg.testFileCount / splitThreshold);
    const baseWeight = Math.floor(pkg.testFileCount / count);
    const remainder = pkg.testFileCount % count;
    for (let i = 1; i <= count; i += 1) {
      const weight = baseWeight + (i <= remainder ? 1 : 0);
      result.push({
        name: pkg.name,
        weight,
        vitestShardIndex: i,
        vitestShardCount: count,
      });
    }
  }
  return result;
}

/**
 * Plan shard assignments using greedy bin-packing.
 * Packages exceeding the average weight per shard are automatically split
 * into virtual entries that carry vitest --shard info for intra-package
 * parallelism.
 *
 * Each returned entry is { name, weight, vitestShardIndex?, vitestShardCount? }.
 * Plain entries (no shard fields) run the full package test suite.
 * Virtual entries run `vitest --shard index/count` within the package.
 */
export function planShardAssignments(packages, total) {
  const totalWeight = packages.reduce((sum, p) => sum + p.testFileCount, 0);
  const splitThreshold = totalWeight > 0 ? Math.ceil(totalWeight / total) : Infinity;
  const virtualPackages = expandVirtualPackages(packages, splitThreshold);

  const shardAssignments = Array.from({ length: total }, () => []);
  const shardWeights = Array.from({ length: total }, () => 0);
  const sorted = [...virtualPackages].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.name.localeCompare(a.name);
  });

  for (const entry of sorted) {
    let targetIndex = 0;
    for (let index = 1; index < total; index += 1) {
      if (shardWeights[index] < shardWeights[targetIndex]) {
        targetIndex = index;
      }
    }

    shardAssignments[targetIndex].push(entry);
    shardWeights[targetIndex] += entry.weight;
  }

  return shardAssignments;
}

export function selectShardPackages(packages, shard, total) {
  return planShardAssignments(packages, total)[shard - 1] || [];
}

export function listWorkspaceTestPackages({ projectRoot = process.cwd() } = {}) {
  return listWorkspacePackageInfos({ projectRoot })
    .filter((workspacePackage) => workspacePackage.hasTestScript)
    .map((workspacePackage) => ({
      name: workspacePackage.name,
      dir: workspacePackage.dir,
      testFileCount: countPackageTestFiles(workspacePackage.dir, { projectRoot }),
    }));
}

function entryLabel(entry) {
  if (entry.vitestShardCount) {
    return `${entry.name} [${entry.vitestShardIndex}/${entry.vitestShardCount}]`;
  }
  return entry.name;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const { shard, total } = parseShardArgs(argv, env);
  const shardEntries = selectShardPackages(listWorkspaceTestPackages(), shard, total);

  if (shardEntries.length === 0) {
    console.log(`[ci-test-shard] shard ${shard}/${total} has no assigned packages; skipping.`);
    return;
  }

  console.log(`[ci-test-shard] shard ${shard}/${total}: ${shardEntries.map(entryLabel).join(", ")}`);

  const { totalWorkers, concurrency } = defaultTestWorkerBudget(env);
  const shardEnv = {
    ...env,
    FUSION_TEST_TOTAL_WORKERS: env.FUSION_TEST_TOTAL_WORKERS || String(totalWorkers),
    FUSION_TEST_CONCURRENCY: env.FUSION_TEST_CONCURRENCY || String(concurrency),
  };

  run("pnpm", ["sync:fusion-skill:check"], { env: shardEnv });
  ensureTestArtifacts(process.cwd());

  // Group entries: plain packages run together in one pnpm invocation;
  // virtual (sharded) entries each get their own vitest --shard invocation.
  const plain = shardEntries.filter((e) => !e.vitestShardCount);
  const virtual = shardEntries.filter((e) => e.vitestShardCount);

  if (plain.length > 0) {
    const filters = plain.flatMap((e) => ["--filter", e.name]);
    run("pnpm", [...filters, "test"], { env: shardEnv });
  }

  for (const entry of virtual) {
    console.log(
      `[ci-test-shard] running ${entry.name} --shard ${entry.vitestShardIndex}/${entry.vitestShardCount}`,
    );
    run(
      "pnpm",
      ["--filter", entry.name, "exec", "vitest", "run", "--shard", `${entry.vitestShardIndex}/${entry.vitestShardCount}`],
      { env: shardEnv },
    );
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main();
}
