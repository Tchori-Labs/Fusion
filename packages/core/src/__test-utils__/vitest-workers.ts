import { cpus } from "node:os";

interface ComputeMaxWorkersOptions {
  defaultCap?: number;
}

// Shared worker-budget computation for every package's vitest.config.
//
// Resolution order:
//   1. VITEST_MAX_WORKERS — explicit per-run override, wins unconditionally.
//   2. FUSION_TEST_TOTAL_WORKERS — global budget across the workspace, divided
//      by FUSION_TEST_CONCURRENCY (default 1). Lets `pnpm -r` runs cap total
//      fan-out instead of multiplying per package.
//   3. defaultCap — small ceiling (2 by default) so a single package run on a
//      high-core machine stays gentle.
// All paths clamp to (cpus - 1) so we never oversubscribe.
export function computeMaxWorkers(options: ComputeMaxWorkersOptions = {}): number {
  const { defaultCap = 2 } = options;

  const cpuCap = Math.max(1, cpus().length - 1);

  const explicit = Number.parseInt(process.env.VITEST_MAX_WORKERS ?? "", 10);
  if (Number.isFinite(explicit) && explicit > 0) {
    const clamped = Math.min(Math.max(1, explicit), cpuCap);
    process.env.VITEST_MAX_WORKERS = String(clamped);
    return clamped;
  }

  const totalBudget = Number.parseInt(process.env.FUSION_TEST_TOTAL_WORKERS ?? "", 10);
  const concurrency = Math.max(
    1,
    Number.parseInt(process.env.FUSION_TEST_CONCURRENCY ?? "1", 10) || 1,
  );

  let workers: number;
  if (Number.isFinite(totalBudget) && totalBudget > 0) {
    workers = Math.max(1, Math.floor(totalBudget / concurrency));
  } else {
    workers = defaultCap;
  }

  workers = Math.min(workers, cpuCap);
  process.env.VITEST_MAX_WORKERS = String(workers);
  return workers;
}
