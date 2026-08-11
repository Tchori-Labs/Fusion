import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { createAsyncDataLayer, type AsyncDataLayer } from "../../postgres/data-layer.js";

const PG_TEST_URL_BASE =
  process.env.FUSION_PG_TEST_URL_BASE ?? "postgresql://localhost:5432";
const PG_AVAILABLE =
  process.env.FUSION_PG_TEST_SKIP !== "1" && Boolean(PG_TEST_URL_BASE);

const pgDescribe = PG_AVAILABLE ? describe : describe.skip;

function uniqueDbName(): string {
  return `fusion_sat_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
}

/*
FNXC:PgTestAuthFix 2026-07-14-00:00:
The inline adminExec used process.env.USER for the psql -U flag, which is 'runner' on GitHub Actions (not 'postgres'). Use the PG_TEST_URL_BASE connection string instead so credentials are always correct.
*/
function adminExec(statement: string): void {
  execSync(
    `psql "${PG_TEST_URL_BASE}/postgres" -v ON_ERROR_STOP=1 -c "${statement.replace(/"/g, '\\"')}"`,
    { stdio: "pipe", env: process.env },
  );
}

interface StoreTestCtx {
  dbName: string;
  testUrl: string;
  layer: AsyncDataLayer;
}

async function setupCtx(): Promise<StoreTestCtx> {
  const dbName = uniqueDbName();
  try { adminExec(`DROP DATABASE IF EXISTS "${dbName}"`); } catch { /* may not exist */ }
  adminExec(`CREATE DATABASE "${dbName}"`);
  const testUrl = `${PG_TEST_URL_BASE}/${dbName}`;
  const { createConnectionSetFromUrl } = await import("../../postgres/connection.js");
  const { applySchemaBaseline } = await import("../../postgres/schema-applier.js");
  const { resolveBackendWithOptions } = await import("../../postgres/backend-resolver.js");
  const backend = resolveBackendWithOptions({ databaseUrl: testUrl, databaseMigrationUrl: testUrl });
  const connections = await createConnectionSetFromUrl(backend, { poolMax: 3, connectTimeoutSeconds: 5 });
  await applySchemaBaseline(connections.migration);
  const layer = createAsyncDataLayer(connections);
  return { dbName, testUrl, layer };
}

async function teardownCtx(ctx: StoreTestCtx | null): Promise<void> {
  if (!ctx) return;
  try { await ctx.layer.close(); } catch { /* best-effort */ }
  try { adminExec(`DROP DATABASE IF EXISTS "${ctx.dbName}"`); } catch { /* best-effort */ }
}

/*
FNXC:ApprovalLifecycleSecurity 2026-07-30-13:10 (ported from the deleted sync branch):
These assertions arrived with the approval-hardening work as `approval-request-store-lifecycle.test.ts`,
which drove the store's SYNC SQLite branch through an in-memory double. The PostgreSQL migration deleted
that branch, so the original file tested code that no longer exists — and deleting it outright would have
left the hardening (atomic guarded decide/complete, lazy TTL expiry, requester-ownership on redemption)
with no coverage at all on the path that actually runs.

Same contract, re-pointed at the async/PG implementation.

WHAT THESE DO AND DO NOT COVER, measured by reverting each guard in turn rather than assumed:
  - transition rules (replay, approve-then-deny, complete-while-pending) -> 3 of 6 fail when removed
  - requester-ownership on redemption                                    -> 1 of 6 fails when removed
  - the `AND status = ?` guard on the UPDATE                             -> 0 fail when removed

That last line is the honest limit. The in-transaction re-read already rejects a replay single-threaded,
so the guard only earns its keep against a racer committing BETWEEN the read and the write — which needs
two concurrent transactions these tests do not create. The guard stays because the race is real; it is
simply not what is verified here. Do not read a green run as proof of it.
*/
pgDescribe("approval request lifecycle security (PostgreSQL)", () => {
  let ctx: StoreTestCtx | null = null;
  afterEach(async () => {
    await teardownCtx(ctx);
    ctx = null;
  });

  const REQUESTER = { actorId: "agent-1", actorType: "agent" as const, actorName: "Bot" };
  const DECIDER = { actorId: "user-1", actorType: "user" as const, actorName: "Admin" };

  async function seed(id: string) {
    const store = await import("../../async-stores/async-approval-request-store.js");
    await store.createApprovalRequest(ctx!.layer, {
      id,
      requester: REQUESTER,
      targetAction: { category: "shell", action: "exec", summary: "run cmd", resourceType: "host", resourceId: "local", context: { cmd: "ls" } },
    });
    return store;
  }

  /*
  FNXC:ApprovalQueueVisibility 2026-08-11-11:20:
  Tchori-Labs/Fusion#17's silent zero came from context.ts resolving an omitted
  projectId to a fallback layer while connection.ts bound that layer's
  fusion.project_id GUC to another project. This test preserves both halves:
  ordinary reads stay RLS-bound to project-b, while the explicit read-only
  bypass returns project-a rows and their audit history for a global queue.
  */
  it("keeps default reads scoped while opt-in reads expose cross-project requests and audit history", async () => {
    ctx = await setupCtx();
    const { ApprovalRequestStore } = await import("../../agents/approval-request-store.js");
    const { createConnectionSetFromUrl } = await import("../../postgres/connection.js");
    const { resolveBackendWithOptions } = await import("../../postgres/backend-resolver.js");
    const backend = resolveBackendWithOptions({ databaseUrl: ctx.testUrl, databaseMigrationUrl: ctx.testUrl });
    const projectAConnections = await createConnectionSetFromUrl(backend, {
      poolMax: 1,
      connectTimeoutSeconds: 5,
      projectId: "project-a",
      bypassProjectIsolation: false,
      useRuntimeRole: true,
    });
    const projectBConnections = await createConnectionSetFromUrl(backend, {
      poolMax: 1,
      connectTimeoutSeconds: 5,
      projectId: "project-b",
      bypassProjectIsolation: false,
      useRuntimeRole: true,
    });
    const projectA = createAsyncDataLayer(projectAConnections, { projectId: "project-a" });
    const projectB = createAsyncDataLayer(projectBConnections, { projectId: "project-b" });
    try {
      const projectAStore = new ApprovalRequestStore(null, { asyncLayer: projectA });
      const request = await projectAStore.create({
        requester: REQUESTER,
        targetAction: { category: "command_execution", action: "run", summary: "Run command", resourceType: "command", resourceId: "cmd-a" },
      });
      const projectBStore = new ApprovalRequestStore(null, { asyncLayer: projectB });

      await expect(projectBStore.list()).resolves.toEqual([]);
      await expect(projectBStore.get(request.id)).resolves.toBeNull();

      const projectBRequest = await projectBStore.create({
        requester: { ...REQUESTER, actorId: "agent-2" },
        targetAction: { category: "command_execution", action: "run", summary: "Run project-b command", resourceType: "command", resourceId: "cmd-b" },
      });
      await expect(projectAStore.list()).resolves.toMatchObject([{ id: request.id, projectId: "project-a" }]);
      await expect(projectBStore.list()).resolves.toMatchObject([{ id: projectBRequest.id, projectId: "project-b" }]);
      await expect(projectBStore.list({ status: "approved" })).resolves.toEqual([]);

      const globalRequests = await projectBStore.list({}, { crossProject: true });
      expect(globalRequests).toHaveLength(2);
      expect(globalRequests).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: request.id, projectId: "project-a" }),
        expect.objectContaining({ id: projectBRequest.id, projectId: "project-b" }),
      ]));
      await expect(projectBStore.list({ status: "pending", limit: 1, offset: 1 }, { crossProject: true })).resolves.toHaveLength(1);
      await expect(projectBStore.get(request.id, { crossProject: true })).resolves.toMatchObject({ projectId: "project-a" });
      await expect(projectBStore.getAuditHistory(request.id, { crossProject: true })).resolves.toHaveLength(1);
    } finally {
      await projectA.close();
      await projectB.close();
    }
  });

  it("a same-verdict replay is rejected as an invalid transition", async () => {
    ctx = await setupCtx();
    const store = await seed("apr-replay");
    await store.decideApprovalRequest(ctx.layer, "apr-replay", "approved", { actor: DECIDER });

    await expect(
      store.decideApprovalRequest(ctx.layer, "apr-replay", "approved", { actor: DECIDER }),
    ).rejects.toThrow(/Invalid approval request transition/);
  });

  it("a replay does not re-stamp decidedAt or append a duplicate audit event", async () => {
    ctx = await setupCtx();
    const store = await seed("apr-nodup");
    const first = await store.decideApprovalRequest(ctx.layer, "apr-nodup", "approved", { actor: DECIDER });
    const auditBefore = await store.getApprovalAuditHistory(ctx.layer.db, "apr-nodup");

    await expect(
      store.decideApprovalRequest(ctx.layer, "apr-nodup", "approved", { actor: DECIDER }),
    ).rejects.toThrow(/Invalid approval request transition/);

    const after = await store.getApprovalRequest(ctx.layer.db, "apr-nodup");
    expect(after?.decidedAt).toBe(first.decidedAt);
    expect(await store.getApprovalAuditHistory(ctx.layer.db, "apr-nodup")).toHaveLength(auditBefore.length);
  });

  it("approve then deny is rejected — the first decision stands", async () => {
    ctx = await setupCtx();
    const store = await seed("apr-flip");
    await store.decideApprovalRequest(ctx.layer, "apr-flip", "approved", { actor: DECIDER });

    await expect(
      store.decideApprovalRequest(ctx.layer, "apr-flip", "denied", { actor: DECIDER }),
    ).rejects.toThrow(/Invalid approval request transition/);
    expect((await store.getApprovalRequest(ctx.layer.db, "apr-flip"))?.status).toBe("approved");
  });

  it("deciding a request that does not exist reports not-found", async () => {
    ctx = await setupCtx();
    const store = await import("../../async-stores/async-approval-request-store.js");

    await expect(
      store.decideApprovalRequest(ctx.layer, "apr-missing", "approved", { actor: DECIDER }),
    ).rejects.toThrow(/not found/);
  });

  it("markCompleted on a still-pending request is rejected", async () => {
    ctx = await setupCtx();
    const store = await seed("apr-pending");

    await expect(
      store.markApprovalRequestCompleted(ctx.layer, "apr-pending", { actor: DECIDER }),
    ).rejects.toThrow(/Invalid approval request transition/);
  });

  it("a grant can only be redeemed by the actor it was issued to", async () => {
    /*
    The ownership check is the containment that matters: without it any caller who learned a request id
    could redeem someone else's approved grant.
    */
    ctx = await setupCtx();
    const store = await seed("apr-owner");
    await store.decideApprovalRequest(ctx.layer, "apr-owner", "approved", { actor: DECIDER });

    await expect(
      store.markApprovalRequestCompleted(ctx.layer, "apr-owner", { actor: DECIDER, expectedRequesterActorId: "someone-else" }),
    ).rejects.toThrow(/requester mismatch/);
    expect((await store.getApprovalRequest(ctx.layer.db, "apr-owner"))?.status).toBe("approved");

    const completed = await store.markApprovalRequestCompleted(ctx.layer, "apr-owner", {
      actor: DECIDER,
      expectedRequesterActorId: REQUESTER.actorId,
    });
    expect(completed.status).toBe("completed");
  });
});
