import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TaskStore, type Settings, type TaskStore as TaskStoreType } from "@fusion/core";

import { SelfHealingManager } from "../self-healing.js";

function createMockStore(overrides: Record<string, unknown> = {}): TaskStoreType & EventEmitter {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    getSettings: vi.fn().mockResolvedValue({
      maintenanceIntervalMs: 0,
      globalPause: false,
      enginePaused: false,
    } as unknown as Settings),
    listTasks: vi.fn().mockResolvedValue([]),
    walCheckpoint: vi.fn().mockReturnValue({ busy: 0, log: 0, checkpointed: 0 }),
    pruneOperationalLogs: vi.fn().mockReturnValue({ deletedByTable: {}, deletedTotal: 0 }),
    pruneAgentLogFiles: vi.fn().mockReturnValue({ prunedFiles: 0, prunedEntries: 0, freedBytes: 0 }),
    recordRunAuditEvent: vi.fn().mockResolvedValue(undefined),
    fts5Available: true,
    getFtsIndexBytes: vi.fn().mockReturnValue(1024),
    getTaskRowCount: vi.fn().mockReturnValue(4),
    optimizeFts5: vi.fn().mockReturnValue(true),
    getDatabase: vi.fn().mockReturnValue({ rebuildFts5Index: vi.fn().mockReturnValue(true) }),
    ...overrides,
  }) as unknown as TaskStoreType & EventEmitter;
}

function makeTmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const createdDirs = new Set<string>();

function trackDir(path: string): string {
  createdDirs.add(path);
  return path;
}

async function createStore(options?: { disableFts5?: boolean; inMemoryDb?: boolean }) {
  const prevEnv = process.env.FUSION_DISABLE_FTS5;
  if (options?.disableFts5) {
    process.env.FUSION_DISABLE_FTS5 = "1";
  } else if (prevEnv === "1") {
    delete process.env.FUSION_DISABLE_FTS5;
  }

  const rootDir = trackDir(makeTmpDir("kb-engine-fts-root-"));
  const globalDir = trackDir(makeTmpDir("kb-engine-fts-global-"));
  const store = new TaskStore(rootDir, globalDir, { inMemoryDb: options?.inMemoryDb === true });
  await store.init();
  const manager = new SelfHealingManager(store, { rootDir });

  return {
    rootDir,
    globalDir,
    store,
    manager,
    restoreEnv() {
      if (prevEnv === undefined) {
        delete process.env.FUSION_DISABLE_FTS5;
      } else {
        process.env.FUSION_DISABLE_FTS5 = prevEnv;
      }
    },
  };
}

async function cleanupStore(context: Awaited<ReturnType<typeof createStore>> | undefined) {
  if (!context) return;
  context.manager.stop();
  context.store.close();
  context.restoreEnv();
  await rm(context.rootDir, { recursive: true, force: true });
  await rm(context.globalDir, { recursive: true, force: true });
  createdDirs.delete(context.rootDir);
  createdDirs.delete(context.globalDir);
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of Array.from(createdDirs)) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      rmSync(dir, { recursive: true, force: true });
    } finally {
      createdDirs.delete(dir);
    }
  }
});

describe("SelfHealingManager FTS maintenance", () => {
  it("runs incremental merge on ordinary maintenance ticks and records audit telemetry", async () => {
    const store = createMockStore({
      getFtsIndexBytes: vi.fn().mockReturnValueOnce(2048).mockReturnValueOnce(1024),
    });
    const manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project" });
    (manager as any).maintenanceTickCounter = 1;

    await (manager as any).maintainTaskFts();

    expect(store.optimizeFts5).toHaveBeenCalledWith("merge");
    expect(store.recordRunAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      domain: "database",
      mutationType: "task:fts-maintenance",
      target: "tasks_fts",
      metadata: expect.objectContaining({
        mode: "merge",
        bytesBefore: 2048,
        bytesAfter: 1024,
        rebuilt: false,
        taskCount: 4,
      }),
    }));
  });

  it("runs optimize on the configured cadence", async () => {
    const store = createMockStore();
    const manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project" });
    (manager as any).maintenanceTickCounter = 4;

    await (manager as any).maintainTaskFts();

    expect(store.optimizeFts5).toHaveBeenCalledWith("optimize");
  });

  it("rebuilds when the index exceeds the absolute threshold", async () => {
    const rebuildFts5Index = vi.fn().mockReturnValue(true);
    const store = createMockStore({
      getFtsIndexBytes: vi.fn().mockReturnValueOnce(40 * 1024 * 1024).mockReturnValueOnce(128 * 1024),
      getDatabase: vi.fn().mockReturnValue({ rebuildFts5Index }),
      getTaskRowCount: vi.fn().mockReturnValue(2),
    });
    const manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project" });
    (manager as any).maintenanceTickCounter = 2;

    await (manager as any).maintainTaskFts();

    expect(rebuildFts5Index).toHaveBeenCalledTimes(1);
    expect(store.optimizeFts5).not.toHaveBeenCalled();
    expect(store.recordRunAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ mode: "rebuild", rebuilt: true }),
    }));
  });

  it("rebuilds when the per-task ratio exceeds the relative threshold", async () => {
    const rebuildFts5Index = vi.fn().mockReturnValue(true);
    const store = createMockStore({
      getFtsIndexBytes: vi.fn().mockReturnValueOnce(2 * 1024 * 1024).mockReturnValueOnce(64 * 1024),
      getDatabase: vi.fn().mockReturnValue({ rebuildFts5Index }),
      getTaskRowCount: vi.fn().mockReturnValue(1),
    });
    const manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project" });
    (manager as any).maintenanceTickCounter = 2;

    await (manager as any).maintainTaskFts();

    expect(rebuildFts5Index).toHaveBeenCalledTimes(1);
    expect(store.recordRunAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        mode: "rebuild",
        relativeThresholdBytes: 1024 * 1024,
      }),
    }));
  });

  it("skips cleanly when FTS5 is unavailable", async () => {
    const store = createMockStore({ fts5Available: false });
    const manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project" });

    await expect((manager as any).maintainTaskFts()).resolves.toBeUndefined();
    expect(store.optimizeFts5).not.toHaveBeenCalled();
    expect(store.recordRunAuditEvent).not.toHaveBeenCalled();
  });

  it("compacts a real disk-backed index and keeps archive search working", async () => {
    let ctx: Awaited<ReturnType<typeof createStore>> | undefined;
    try {
      ctx = await createStore();
      const { store, manager } = ctx;
      if (!store.fts5Available) {
        expect(store.fts5Available).toBe(false);
        return;
      }

      const churnTask = await store.createTask({ title: "fts seed", description: "fts seed description", column: "todo" });
      const softDeleted = await store.createTask({ title: "soft delete target", description: "soft-delete-needle", column: "todo" });
      const archived = await store.createTask({ title: "archive target", description: "archive-needle", column: "done" });
      await store.archiveTask(archived.id);

      const before = store.getFtsIndexBytes();
      const update = store.getDatabase().prepare(`
        UPDATE tasks
        SET title = ?, description = ?, comments = ?, updatedAt = ?
        WHERE id = ?
      `);
      for (let i = 0; i < 220; i++) {
        const marker = `marker-${i}`;
        const payload = `${"alpha ".repeat(600)}${marker}`;
        update.run(
          `fts ${marker}`,
          payload,
          JSON.stringify([{ id: `c-${i}`, text: `${payload} comment` }]),
          `2026-06-03T00:${String(i % 60).padStart(2, "0")}:00.000Z`,
          churnTask.id,
        );
      }
      const grown = store.getFtsIndexBytes();
      expect(before).not.toBeNull();
      expect(grown).not.toBeNull();
      expect(grown!).toBeGreaterThan(before!);

      await store.deleteTask(softDeleted.id);
      (manager as any).maintenanceTickCounter = 2;
      await (manager as any).maintainTaskFts();

      const after = store.getFtsIndexBytes();
      expect(after).not.toBeNull();
      expect(after!).toBeLessThan(grown!);
      expect(after!).toBeLessThan(store.getTaskRowCount() * 1024 * 1024);

      const searchResults = await store.searchTasks("marker-219");
      expect(searchResults.map((task) => task.id)).toContain(churnTask.id);
      expect((await store.searchTasks("soft-delete-needle")).map((task) => task.id)).not.toContain(softDeleted.id);

      const archiveResults = (store as any).archiveDb.search("archive-needle", 10) as Array<{ id: string }>;
      expect(archiveResults.map((task) => task.id)).toContain(archived.id);
    } finally {
      await cleanupStore(ctx);
    }
  });

  it("real disk-backed maintenance is a no-op when FTS5 is disabled", async () => {
    let ctx: Awaited<ReturnType<typeof createStore>> | undefined;
    try {
      ctx = await createStore({ disableFts5: true });
      const { store, manager } = ctx;
      expect(store.fts5Available).toBe(false);
      await expect((manager as any).maintainTaskFts()).resolves.toBeUndefined();
    } finally {
      await cleanupStore(ctx);
    }
  });

  it("does not throw for in-memory stores", async () => {
    let ctx: Awaited<ReturnType<typeof createStore>> | undefined;
    try {
      ctx = await createStore({ inMemoryDb: true });
      const { store, manager } = ctx;
      if (!store.fts5Available) {
        expect(store.fts5Available).toBe(false);
        return;
      }

      await store.createTask({ title: "memory fts", description: "memory fts payload", column: "todo" });
      (manager as any).maintenanceTickCounter = 4;
      await expect((manager as any).maintainTaskFts()).resolves.toBeUndefined();
    } finally {
      await cleanupStore(ctx);
    }
  });
});
