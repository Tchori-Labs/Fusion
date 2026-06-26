import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { InvalidFileScopeError, TaskStore, TombstonedTaskResurrectionError } from "../store.js";
import { commitDistributedTaskIdReservationInExistingTransaction } from "../distributed-task-id.js";
import { clearInMemoryDbSnapshot, installInMemoryDbSnapshot, makeTmpDir } from "./store-test-helpers.js";

function reservationRows(store: TaskStore) {
  return store.getDatabase().prepare(
    "SELECT taskId, status, sequence FROM distributed_task_id_reservations ORDER BY sequence",
  ).all() as Array<{ taskId: string; status: string; sequence: number }>;
}

function committedReservationPhantoms(store: TaskStore) {
  return store.getDatabase().prepare(
    `SELECT r.taskId
       FROM distributed_task_id_reservations r
       LEFT JOIN tasks t ON t.id = r.taskId
      WHERE r.status = 'committed' AND t.id IS NULL
      ORDER BY r.taskId`,
  ).all() as Array<{ taskId: string }>;
}

function reservationTaskMismatches(store: TaskStore) {
  return store.getDatabase().prepare(
    `SELECT t.id AS taskId, r.status
       FROM tasks t
       JOIN distributed_task_id_reservations r ON r.taskId = t.id
      WHERE t.deletedAt IS NULL AND r.status != 'committed'
      ORDER BY t.id`,
  ).all() as Array<{ taskId: string; status: string }>;
}

function expectNoReservationTaskDivergence(store: TaskStore) {
  expect(committedReservationPhantoms(store)).toEqual([]);
  expect(reservationTaskMismatches(store)).toEqual([]);
}

async function createStore(options: { inMemoryDb: boolean }) {
  const rootDir = makeTmpDir();
  const globalDir = makeTmpDir();
  const store = new TaskStore(rootDir, globalDir, { inMemoryDb: options.inMemoryDb });
  await store.init();
  return { rootDir, globalDir, store };
}

describe("FN-7074 task-create reservation atomicity", () => {
  const cleanup: Array<() => Promise<void>> = [];

  beforeAll(() => installInMemoryDbSnapshot());
  afterAll(() => clearInMemoryDbSnapshot());

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  async function scopedStore(options: { inMemoryDb: boolean } = { inMemoryDb: true }) {
    const context = await createStore(options);
    cleanup.push(async () => {
      context.store.stopWatching();
      await context.store.close();
      await rm(context.rootDir, { recursive: true, force: true });
      await rm(context.globalDir, { recursive: true, force: true });
    });
    return context;
  }

  it.each([
    ["in-memory", true],
    ["file-backed", false],
  ])("commits reservation iff task row and task directory land for %s stores", async (_label, inMemoryDb) => {
    const { rootDir, store } = await scopedStore({ inMemoryDb });

    const task = await store.createTask({ description: "happy atomic create" });

    expect(reservationRows(store)).toEqual([{ taskId: task.id, status: "committed", sequence: 1 }]);
    expect(store.getDatabase().prepare("SELECT id FROM tasks WHERE id = ?").get(task.id)).toMatchObject({ id: task.id });
    expect(existsSync(join(rootDir, ".fusion", "tasks", task.id, "task.json"))).toBe(true);
    expect(existsSync(join(rootDir, ".fusion", "tasks", task.id, "PROMPT.md"))).toBe(true);
    expectNoReservationTaskDivergence(store);
  });

  it("aborts the reservation and leaves no task row when the tasks-row insert fails", async () => {
    const { store } = await scopedStore();
    const original = (store as unknown as { insertTaskWithFtsRecovery: (...args: unknown[]) => void }).insertTaskWithFtsRecovery;
    (store as unknown as { insertTaskWithFtsRecovery: (...args: unknown[]) => void }).insertTaskWithFtsRecovery = () => {
      throw new Error("synthetic insert failure");
    };

    await expect(store.createTask({ description: "insert should fail" })).rejects.toThrow("synthetic insert failure");
    (store as unknown as { insertTaskWithFtsRecovery: (...args: unknown[]) => void }).insertTaskWithFtsRecovery = original;

    expect(reservationRows(store)).toEqual([{ taskId: "FN-001", status: "aborted", sequence: 1 }]);
    expect(store.getDatabase().prepare("SELECT id FROM tasks WHERE id = ?").get("FN-001")).toBeUndefined();
    expectNoReservationTaskDivergence(store);
  });

  it("rolls back the committed reservation and task row when task.json disk write fails after insert", async () => {
    const { rootDir, store } = await scopedStore({ inMemoryDb: false });
    const original = (store as unknown as { writeTaskJsonFile: (...args: unknown[]) => Promise<void> }).writeTaskJsonFile;
    (store as unknown as { writeTaskJsonFile: (...args: unknown[]) => Promise<void> }).writeTaskJsonFile = async () => {
      throw new Error("synthetic task.json write failure");
    };

    await expect(store.createTask({ description: "disk write should fail" })).rejects.toThrow("synthetic task.json write failure");
    (store as unknown as { writeTaskJsonFile: (...args: unknown[]) => Promise<void> }).writeTaskJsonFile = original;

    expect(reservationRows(store)).toEqual([{ taskId: "FN-001", status: "aborted", sequence: 1 }]);
    expect(store.getDatabase().prepare("SELECT id FROM tasks WHERE id = ?").get("FN-001")).toBeUndefined();
    expect(existsSync(join(rootDir, ".fusion", "tasks", "FN-001"))).toBe(false);
    expectNoReservationTaskDivergence(store);
  });

  it("rolls back distributed create reservations when file-scope validation throws", async () => {
    const { rootDir, store } = await scopedStore();
    const originalGenerate = (store as unknown as { generateSpecifiedPrompt: (task: unknown) => string }).generateSpecifiedPrompt;
    (store as unknown as { generateSpecifiedPrompt: (task: unknown) => string }).generateSpecifiedPrompt = () =>
      "# Bad prompt\n\n## File Scope\n\n- `origin/fusion/fn-4280`\n";

    await expect(store.createTask({ description: "bad scope", column: "todo" })).rejects.toBeInstanceOf(InvalidFileScopeError);
    (store as unknown as { generateSpecifiedPrompt: (task: unknown) => string }).generateSpecifiedPrompt = originalGenerate;

    expect(reservationRows(store)).toEqual([{ taskId: "FN-001", status: "aborted", sequence: 1 }]);
    expect(store.getDatabase().prepare("SELECT id FROM tasks WHERE id = ?").get("FN-001")).toBeUndefined();
    expect(existsSync(join(rootDir, ".fusion", "tasks", "FN-001"))).toBe(false);
    expectNoReservationTaskDivergence(store);
  });

  it("rolls back distributed create reservations when duplicate intake hits a recent tombstone", async () => {
    const { store } = await scopedStore();
    await store.updateSettings({ tombstoneStickyWindowDays: 7 });
    const original = await store.createTask({
      title: "Memory leak",
      description: "Fix memory leak in merge worker",
      source: { sourceType: "unknown", sourceAgentId: "agent-1" },
    });
    await store.deleteTask(original.id);

    await expect(store.createTask({
      title: "Memory leak",
      description: "Fix memory leak in merge worker",
      source: { sourceType: "unknown", sourceAgentId: "agent-1" },
    })).rejects.toBeInstanceOf(TombstonedTaskResurrectionError);

    const rows = reservationRows(store);
    expect(rows).toEqual([
      { taskId: "FN-001", status: "committed", sequence: 1 },
      { taskId: "FN-002", status: "aborted", sequence: 2 },
    ]);
    expect(store.getDatabase().prepare("SELECT id FROM tasks WHERE id = ? AND deletedAt IS NULL").get("FN-002")).toBeUndefined();
    expectNoReservationTaskDivergence(store);
  });

  it("preserves ID permanence after a committed create is rolled back", async () => {
    const { store } = await scopedStore();
    const original = (store as unknown as { writeTaskJsonFile: (...args: unknown[]) => Promise<void> }).writeTaskJsonFile;
    (store as unknown as { writeTaskJsonFile: (...args: unknown[]) => Promise<void> }).writeTaskJsonFile = async () => {
      throw new Error("synthetic task.json write failure");
    };
    await expect(store.createTask({ description: "burn FN-001" })).rejects.toThrow("synthetic task.json write failure");
    (store as unknown as { writeTaskJsonFile: (...args: unknown[]) => Promise<void> }).writeTaskJsonFile = original;

    const next = await store.createTask({ description: "next id" });

    expect(next.id).toBe("FN-002");
    expect(reservationRows(store)).toEqual([
      { taskId: "FN-001", status: "aborted", sequence: 1 },
      { taskId: "FN-002", status: "committed", sequence: 2 },
    ]);
    expectNoReservationTaskDivergence(store);
  });

  it("allows replicated direct-reserved creates without requiring a reservation row", async () => {
    const { store } = await scopedStore();
    const now = new Date().toISOString();

    const result = await store.applyReplicatedTaskCreate({
      replicationVersion: 1,
      reservationId: "remote-reservation",
      taskId: "FN-123",
      sourceNodeId: "node-b",
      input: {
        id: "FN-123",
        description: "replicated create",
        column: "triage",
        dependencies: [],
        steps: [],
        currentStep: 0,
        log: [],
        createdAt: now,
        updatedAt: now,
        columnMovedAt: now,
      } as never,
      createdAt: now,
      updatedAt: now,
      prompt: "# replicated\n",
    });

    expect(result.applied).toBe(true);
    expect(reservationRows(store)).toEqual([]);
    expect(store.getDatabase().prepare("SELECT id FROM tasks WHERE id = ?").get("FN-123")).toMatchObject({ id: "FN-123" });
  });

  it("commits reservations inside an existing store transaction without nested transaction errors", async () => {
    const { store } = await scopedStore();
    const allocator = store.getDistributedTaskIdAllocator();
    const reservation = await allocator.reserveDistributedTaskId({ prefix: "FN", nodeId: "node-a" });

    expect(() => {
      store.getDatabase().transactionImmediate(() => {
        commitDistributedTaskIdReservationInExistingTransaction(store.getDatabase(), {
          reservationId: reservation.reservationId,
          nodeId: "node-a",
        });
      });
    }).not.toThrow();

    expect(reservationRows(store)).toEqual([{ taskId: "FN-001", status: "committed", sequence: 1 }]);
  });
});
