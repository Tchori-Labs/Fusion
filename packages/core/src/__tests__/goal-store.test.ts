import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../db.js";
import { GoalStore } from "../goal-store.js";
import { ACTIVE_GOAL_LIMIT, ActiveGoalLimitExceededError } from "../goal-types.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "kb-goal-test-"));
}

describe("GoalStore", () => {
  let tmpDir: string;
  let fusionDir: string;
  let db: Database;
  let store: GoalStore;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    fusionDir = join(tmpDir, ".fusion");
    db = new Database(fusionDir, { inMemory: true });
    db.init();
    store = new GoalStore(fusionDir, db);
  });

  afterEach(async () => {
    try {
      db.close();
    } catch {
      // already closed
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates goals with active status and generated ids", () => {
    const goal = store.createGoal({ title: "Ship v1", description: "Initial launch" });

    expect(goal.id).toMatch(/^G-/);
    expect(goal.status).toBe("active");
    expect(goal.title).toBe("Ship v1");
    expect(goal.description).toBe("Initial launch");
    expect(goal.createdAt).toBeTruthy();
    expect(goal.updatedAt).toBeTruthy();
  });

  it("gets goals by id and returns null for unknown ids", () => {
    const created = store.createGoal({ title: "Find me" });

    expect(store.getGoal(created.id)).toEqual(created);
    expect(store.getGoal("G-UNKNOWN")).toBeNull();
  });

  it("updates title/description and refreshed updatedAt", async () => {
    const created = store.createGoal({ title: "Before", description: "Old" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = store.updateGoal(created.id, { title: "After", description: "New" });

    expect(updated.title).toBe("After");
    expect(updated.description).toBe("New");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
  });

  it("throws when updating unknown goal", () => {
    expect(() => store.updateGoal("G-UNKNOWN", { title: "Nope" })).toThrow("Goal G-UNKNOWN not found");
  });

  it("archives goals and is idempotent for already archived goals", () => {
    const onUpdated = vi.fn();
    store.on("goal:updated", onUpdated);
    const created = store.createGoal({ title: "Archive me" });

    const archived = store.archiveGoal(created.id);
    const archivedAgain = store.archiveGoal(created.id);

    expect(archived.status).toBe("archived");
    expect(archivedAgain.status).toBe("archived");
    expect(archivedAgain.id).toBe(created.id);
    expect(onUpdated).toHaveBeenCalledTimes(2);
  });

  it("throws when archiving unknown goal", () => {
    expect(() => store.archiveGoal("G-UNKNOWN")).toThrow("Goal G-UNKNOWN not found");
  });

  it("lists goals and filters by status sorted by createdAt", () => {
    db.prepare("INSERT INTO goals (id, title, description, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("G-1", "First", null, "active", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    db.prepare("INSERT INTO goals (id, title, description, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("G-2", "Second", null, "archived", "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    db.prepare("INSERT INTO goals (id, title, description, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("G-3", "Third", null, "active", "2026-01-03T00:00:00.000Z", "2026-01-03T00:00:00.000Z");

    const all = store.listGoals();
    const active = store.listGoals({ status: "active" });
    const archived = store.listGoals({ status: "archived" });

    expect(all.map((goal) => goal.id)).toEqual(["G-1", "G-2", "G-3"]);
    expect(active.map((goal) => goal.id)).toEqual(["G-1", "G-3"]);
    expect(archived.map((goal) => goal.id)).toEqual(["G-2"]);
  });

  it("enforces active goal cap on create and allows new create after archive", () => {
    for (let i = 0; i < ACTIVE_GOAL_LIMIT; i += 1) {
      store.createGoal({ title: `Goal ${i + 1}` });
    }

    try {
      store.createGoal({ title: "Goal 6" });
      throw new Error("expected cap error");
    } catch (error) {
      expect(error).toBeInstanceOf(ActiveGoalLimitExceededError);
      const capError = error as ActiveGoalLimitExceededError;
      expect(capError.code).toBe("ACTIVE_GOAL_LIMIT_EXCEEDED");
      expect(capError.limit).toBe(ACTIVE_GOAL_LIMIT);
      expect(capError.currentActive).toBe(ACTIVE_GOAL_LIMIT);
    }

    const first = store.listGoals({ status: "active" })[0]!;
    store.archiveGoal(first.id);
    const replacement = store.createGoal({ title: "Replacement" });
    expect(replacement.status).toBe("active");
  });

  it("enforces active cap on unarchive and allows unarchive at four active", () => {
    const archived = store.createGoal({ title: "Archived candidate" });
    store.archiveGoal(archived.id);
    for (let i = 0; i < ACTIVE_GOAL_LIMIT; i += 1) {
      store.createGoal({ title: `Active ${i + 1}` });
    }

    expect(() => store.unarchiveGoal(archived.id)).toThrow(ActiveGoalLimitExceededError);

    const oneActive = store.listGoals({ status: "active" })[0]!;
    store.archiveGoal(oneActive.id);
    const restored = store.unarchiveGoal(archived.id);
    expect(restored.status).toBe("active");
  });

  it("unarchive is a no-op for already active goals", () => {
    const created = store.createGoal({ title: "Already active" });

    const result = store.unarchiveGoal(created.id);

    expect(result.status).toBe("active");
    expect(result.id).toBe(created.id);
  });

  it("throws when unarchiving unknown goal", () => {
    expect(() => store.unarchiveGoal("G-UNKNOWN")).toThrow("Goal G-UNKNOWN not found");
  });

  it("serializes concurrent creates to cap active goals at five", async () => {
    const attempts = Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() => store.createGoal({ title: `Race ${i}` })));
    const settled = await Promise.allSettled(attempts);

    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(ACTIVE_GOAL_LIMIT);
    expect(rejected).toHaveLength(10 - ACTIVE_GOAL_LIMIT);
    for (const result of rejected) {
      expect(result.status).toBe("rejected");
      expect(result.reason).toBeInstanceOf(ActiveGoalLimitExceededError);
    }

    const activeCount = (db.prepare("SELECT COUNT(*) as count FROM goals WHERE status = 'active'").get() as { count: number } | undefined)?.count ?? 0;
    expect(activeCount).toBe(ACTIVE_GOAL_LIMIT);
  });

  it("emits created and updated events with goal payload", () => {
    const onCreated = vi.fn();
    const onUpdated = vi.fn();
    store.on("goal:created", onCreated);
    store.on("goal:updated", onUpdated);

    const created = store.createGoal({ title: "Event goal" });
    const updated = store.updateGoal(created.id, { title: "Updated event goal" });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });
});
