import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Database } from "../db.js";
import { TaskStore } from "../store.js";
import { makeTmpDir } from "./store-test-helpers.js";

async function seedIntegrityPrecondition(rootDir: string): Promise<void> {
  const fusionDir = join(rootDir, ".fusion");
  await mkdir(fusionDir, { recursive: true });

  const db = new Database(fusionDir);
  db.init();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO tasks (id, description, \"column\", createdAt, updatedAt) VALUES (?, '', 'todo', ?, ?)",
  ).run("FN-100", now, now);
  db.prepare(
    "INSERT INTO distributed_task_id_state (prefix, nextSequence, committedClusterTaskCount, lastCommittedTaskId, updatedAt) VALUES (?, ?, ?, ?, ?)",
  ).run("FN", 100, 0, null, now);
  db.close();
}

describe("TaskStore task ID integrity wiring", () => {
  let rootDir = "";
  let globalDir = "";

  beforeEach(() => {
    rootDir = makeTmpDir();
    globalDir = makeTmpDir();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await rm(globalDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("constructs cleanly and exposes an ok integrity report by default", async () => {
    const store = new TaskStore(rootDir, globalDir);
    await store.init();

    const report = store.getTaskIdIntegrityReport();

    expect(report.status).toBe("ok");
    expect(report.anomalies).toEqual([]);
    expect(report.checkedAt).toEqual(expect.any(String));

    store.close();
  });

  it("logs a structured core error and exposes anomaly status when startup detects corruption preconditions", async () => {
    await seedIntegrityPrecondition(rootDir);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const store = new TaskStore(rootDir, globalDir);
    await store.init();

    const report = store.getTaskIdIntegrityReport();
    expect(report.status).toBe("anomaly");
    expect(report.anomalies).toContainEqual(
      expect.objectContaining({
        kind: "next_sequence_at_or_below_used",
        prefix: "FN",
        affectedIds: ["FN-100"],
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[core] [task-id-integrity] anomaly detected"),
      expect.objectContaining({
        anomalies: expect.arrayContaining([
          expect.objectContaining({
            kind: "next_sequence_at_or_below_used",
            affectedIds: ["FN-100"],
          }),
        ]),
      }),
    );

    store.close();
  });

  it("refreshTaskIdIntegrityReport picks up newly introduced anomalies", async () => {
    const store = new TaskStore(rootDir, globalDir, { inMemoryDb: true });
    await store.init();

    const db = store.getDatabase();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO tasks (id, description, \"column\", createdAt, updatedAt) VALUES (?, '', 'todo', ?, ?)",
    ).run("FN-100", now, now);
    db.prepare(
      "INSERT OR REPLACE INTO distributed_task_id_state (prefix, nextSequence, committedClusterTaskCount, lastCommittedTaskId, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run("FN", 100, 0, null, now);

    const report = store.refreshTaskIdIntegrityReport();

    expect(report.status).toBe("anomaly");
    expect(report.anomalies).toContainEqual(
      expect.objectContaining({
        kind: "next_sequence_at_or_below_used",
        prefix: "FN",
        affectedIds: ["FN-100"],
      }),
    );
    expect(store.getTaskIdIntegrityReport()).toEqual(report);

    store.close();
  });
});
