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
import { createAsyncDistributedTaskIdAllocator, reconcileTaskIdStateAsync } from "../../task-store/async/async-allocator.js";

const PG_TEST_URL_BASE = process.env.FUSION_PG_TEST_URL_BASE ?? "postgresql://localhost:5432";
const pgDescribe = process.env.FUSION_PG_TEST_SKIP === "1" ? describe.skip : describe;

function adminExec(statement: string): void {
  execSync(`psql "${PG_TEST_URL_BASE}/postgres" -v ON_ERROR_STOP=1 -c "${statement.replace(/"/g, "\\\"")}"`, {
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
  const baseline = await createConnectionSetFromUrl(backend, { poolMax: 1, connectTimeoutSeconds: 5 });
  await applySchemaBaseline(baseline.migration);
  await baseline.close();
  const connections = await createConnectionSetFromUrl(backend, { poolMax: 2, connectTimeoutSeconds: 5, projectId: "project-a", useRuntimeRole: true });
  return { dbName, connections, layer: createAsyncDataLayer(connections, { projectId: "project-a" }) };
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
});
