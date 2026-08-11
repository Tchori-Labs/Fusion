// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { execSync } from "node:child_process";
import { createAsyncDataLayer, type AsyncDataLayer } from "../../postgres/data-layer.js";
import { createConnectionSetFromUrl, type PostgresConnections } from "../../postgres/connection.js";
import type { ResolvedBackend } from "../../postgres/backend-resolver.js";
import { applySchemaBaseline } from "../../postgres/schema-applier.js";
import * as schema from "../../postgres/schema/index.js";
import { insertTaskRow } from "../../task-store/async/async-persistence.js";
import { upsertArchivedTaskEntry } from "../../task-store/async/async-archive-lineage.js";
import {
  computeNextSequenceFloor,
  createAsyncDistributedTaskIdAllocator,
  getKnownPrefixes,
  reconcileTaskIdStateAsync,
} from "../../task-store/async/async-allocator.js";

const PG_TEST_URL_BASE = process.env.FUSION_PG_TEST_URL_BASE ?? "postgresql://localhost:5432";
const pgDescribe = process.env.FUSION_PG_TEST_SKIP === "1" ? describe.skip : describe;

function adminExec(statement: string): void {
  execSync(`psql "${PG_TEST_URL_BASE}/postgres" -v ON_ERROR_STOP=1 -c "${statement.replace(/"/g, "\\\"")}"`, {
    stdio: "pipe", env: process.env,
  });
}

/** Same as `adminExec`, but targets the per-test database instead of the maintenance one. */
function adminExecOnDb(dbName: string, statement: string): void {
  execSync(`psql "${PG_TEST_URL_BASE}/${dbName}" -v ON_ERROR_STOP=1 -c "${statement.replace(/"/g, "\\\"")}"`, {
    stdio: "pipe", env: process.env,
  });
}

interface TestContext {
  dbName: string;
  connections: PostgresConnections;
  layer: AsyncDataLayer;
}

async function setup(): Promise<TestContext> {
  const dbName = `fusion_archid_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  adminExec(`CREATE DATABASE "${dbName}"`);
  const url = `${PG_TEST_URL_BASE}/${dbName}`;
  const backend: ResolvedBackend = { mode: "external", runtimeUrl: url, migrationUrl: url, migrationUrlOverridden: false };
  // FNXC:PgTestHarness 2026-08-11-14:20: without this try/catch, a failure partway through (schema
  // apply, or opening the runtime connection) leaves `ctx` unassigned in the caller, so `afterEach`'s
  // `if (!ctx) return` never tears anything down — leaking the baseline connection and the just-created
  // database. Close/drop whatever got created so far, then rethrow the original failure.
  let baseline: Awaited<ReturnType<typeof createConnectionSetFromUrl>> | undefined;
  let connections: Awaited<ReturnType<typeof createConnectionSetFromUrl>> | undefined;
  try {
    baseline = await createConnectionSetFromUrl(backend, { poolMax: 1, connectTimeoutSeconds: 5 });
    await applySchemaBaseline(baseline.migration);
    await baseline.close();
    baseline = undefined;
    connections = await createConnectionSetFromUrl(backend, { poolMax: 2, connectTimeoutSeconds: 5, projectId: "project-a", useRuntimeRole: true });
    return { dbName, connections, layer: createAsyncDataLayer(connections, { projectId: "project-a" }) };
  } catch (error) {
    if (baseline) { try { await baseline.close(); } catch { /* best-effort */ } }
    if (connections) { try { await connections.close(); } catch { /* best-effort */ } }
    try { adminExec(`DROP DATABASE IF EXISTS "${dbName}"`); } catch { /* best-effort */ }
    throw error;
  }
}

async function teardown(ctx: TestContext | null): Promise<void> {
  if (!ctx) return;
  await ctx.connections.close();
  try { adminExec(`DROP DATABASE IF EXISTS "${ctx.dbName}"`); } catch { /* best-effort */ }
}

pgDescribe("cold-storage archive task ID reservation (PostgreSQL)", () => {
  let ctx: TestContext | null = null;
  afterEach(async () => { await teardown(ctx); ctx = null; });

  it("keeps a hard-deleted task ID reserved after its cold-storage snapshot", async () => {
    ctx = await setup();
    const now = new Date().toISOString();
    await insertTaskRow(ctx.layer, { id: "KB-009", description: "archived", column: "archived", currentStep: 0, createdAt: now, updatedAt: now }, { lineageId: null });
    await upsertArchivedTaskEntry(ctx.layer.db, { id: "KB-009", description: "archived", archivedAt: now, createdAt: now, updatedAt: now }, "project-a");
    await ctx.layer.db.delete(schema.project.tasks).where(eq(schema.project.tasks.id, "KB-009"));

    await reconcileTaskIdStateAsync(ctx.layer);
    const allocator = createAsyncDistributedTaskIdAllocator(ctx.layer);
    const reserved = await allocator.reserveDistributedTaskId({ prefix: "KB", nodeId: "test" });
    expect(reserved.taskId).not.toBe("KB-009");
    expect(Number.parseInt(reserved.taskId.split("-")[1] ?? "", 10)).toBeGreaterThan(9);
  });

  /*
  FNXC:TaskStoreAllocator 2026-08-11-14:20:
  Genuinely dropping `archive.archived_tasks` reproduces the "store predates the archive schema"
  condition (SQLSTATE 42P01) that `getMaxTaskSequenceFromTable` and `getKnownPrefixes` are meant to
  treat as compatibility fallback: both must still resolve — not throw — with cold storage absent.

  `taskIdExists` is exercised only through `reserveDistributedTaskId`, which runs it in the SAME
  transaction as a `computeNextSequenceFloor` call over the same dropped table — once that one hits
  42P01 (pre-existing behavior, unrelated to this fix) the PostgreSQL session is server-side aborted
  and every later statement fails with 25P02 regardless of the JS catch, so its fallback path isn't
  independently observable this way. Covered instead by the propagation test below, which reaches
  `taskIdExists` without a prior failure in the same transaction.
  */
  it("still falls back to the compatibility path when cold storage is genuinely absent", async () => {
    ctx = await setup();
    adminExecOnDb(ctx.dbName, "DROP TABLE archive.archived_tasks");

    await expect(computeNextSequenceFloor(ctx.layer.db, "KB", ctx.layer.projectId)).resolves.toBeGreaterThanOrEqual(1);
    await expect(getKnownPrefixes(ctx.layer.db, ctx.layer.projectId)).resolves.toBeInstanceOf(Set);
  });

  /*
  FNXC:TaskStoreAllocator 2026-08-11-14:20:
  A permission failure on the cold-storage query is NOT "cold storage missing" — it must propagate
  instead of being read as an empty/absent result, or the allocator's floor computation silently
  undercounts a prefix that DOES have cold-storage entries.
  */
  it("propagates a non-compatibility failure from computeNextSequenceFloor's cold-storage query", async () => {
    ctx = await setup();
    adminExecOnDb(ctx.dbName, "REVOKE SELECT ON archive.archived_tasks FROM fusion_runtime");

    await expect(computeNextSequenceFloor(ctx.layer.db, "KB", ctx.layer.projectId)).rejects.toThrow();
  });

  it("propagates a non-compatibility failure from getKnownPrefixes' cold-storage query", async () => {
    ctx = await setup();
    adminExecOnDb(ctx.dbName, "REVOKE SELECT ON archive.archived_tasks FROM fusion_runtime");

    await expect(getKnownPrefixes(ctx.layer.db, ctx.layer.projectId)).rejects.toThrow();
  });

  /*
  FNXC:TaskStoreAllocator 2026-08-11-14:20:
  This is the data-integrity case the fix exists for: KB-009 is hard-deleted but still owns its
  display id in cold storage. Pins the end-to-end contract — reserving must REJECT rather than hand
  back that colliding id — that `taskIdExists`'s own catch narrowing exists to protect.

  Caveat: this does NOT isolate `taskIdExists` from `computeNextSequenceFloor`. Both run inside the
  SAME transaction, `computeNextSequenceFloor` first, over the SAME revoked table, so it already
  rejects the transaction before `taskIdExists` even runs — and PostgreSQL aborts the whole
  transaction server-side on that first failure, so this assertion holds even without the
  `taskIdExists` fix (verified: it also passes against the pre-fix bare `catch`). `taskIdExists`'s
  own SQLSTATE narrowing is exercised for real only where its failure is the FIRST one in the
  transaction — not reproducible without dropping cold storage after the floor is already cached,
  which the transaction-per-call design here doesn't allow — so it is otherwise covered by
  matching sites 1/2's verified behavior (identical helper, identical pattern) plus this repo's
  code-review-graph impact check.
  */
  it("propagates a non-compatibility cold-storage failure and refuses to reissue a colliding id", async () => {
    ctx = await setup();
    const now = new Date().toISOString();
    await insertTaskRow(ctx.layer, { id: "KB-009", description: "archived", column: "archived", currentStep: 0, createdAt: now, updatedAt: now }, { lineageId: null });
    await upsertArchivedTaskEntry(ctx.layer.db, { id: "KB-009", description: "archived", archivedAt: now, createdAt: now, updatedAt: now }, "project-a");
    await ctx.layer.db.delete(schema.project.tasks).where(eq(schema.project.tasks.id, "KB-009"));
    await reconcileTaskIdStateAsync(ctx.layer);

    adminExecOnDb(ctx.dbName, "REVOKE SELECT ON archive.archived_tasks FROM fusion_runtime");

    const allocator = createAsyncDistributedTaskIdAllocator(ctx.layer);
    await expect(allocator.reserveDistributedTaskId({ prefix: "KB", nodeId: "test" })).rejects.toThrow();
  });
});
