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

export function planShardAssignments(packages, total) {
  const shardAssignments = Array.from({ length: total }, () => []);
  const shardWeights = Array.from({ length: total }, () => 0);
  const normalized = packages
    .map((pkg) => ({
      name: pkg.name,
      weight: pkg.testFileCount,
    }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.name.localeCompare(b.name);
    });

  for (const pkg of normalized) {
    let targetIndex = 0;
    for (let index = 1; index < total; index += 1) {
      if (shardWeights[index] < shardWeights[targetIndex]) {
        targetIndex = index;
      }
    }

    shardAssignments[targetIndex].push(pkg.name);
    shardWeights[targetIndex] += pkg.weight;
  }

  return shardAssignments;
}

export function selectShardPackages(packages, shard, total) {
  return planShardAssignments(packages, total)[shard - 1];
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

export function main(argv = process.argv.slice(2), env = process.env) {
  const { shard, total } = parseShardArgs(argv, env);
  const shardPackages = selectShardPackages(listWorkspaceTestPackages(), shard, total);

  if (shardPackages.length === 0) {
    console.log(`[ci-test-shard] shard ${shard}/${total} has no assigned packages; skipping.`);
    return;
  }

  console.log(`[ci-test-shard] shard ${shard}/${total}: ${shardPackages.join(", ")}`);

  const { totalWorkers, concurrency } = defaultTestWorkerBudget(env);
  const shardEnv = {
    ...env,
    FUSION_TEST_TOTAL_WORKERS: env.FUSION_TEST_TOTAL_WORKERS || String(totalWorkers),
    FUSION_TEST_CONCURRENCY: env.FUSION_TEST_CONCURRENCY || String(concurrency),
  };

  run("pnpm", ["sync:fusion-skill:check"], { env: shardEnv });
  ensureTestArtifacts(process.cwd());
  const filters = shardPackages.flatMap((pkg) => ["--filter", pkg]);
  run("pnpm", [...filters, "test"], { env: shardEnv });
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main();
}
