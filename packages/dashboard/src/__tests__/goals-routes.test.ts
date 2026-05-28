// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Goal, GoalStatus, TaskStore } from "@fusion/core";
import { createGoalsRouter } from "../goals-routes.js";
import { get, request } from "../test-request.js";

function createMockGoalStore() {
  const goals = new Map<string, Goal>();
  let next = 1;

  const listGoals = (filter?: { status?: GoalStatus }) => {
    const all = Array.from(goals.values());
    return filter?.status ? all.filter((g) => g.status === filter.status) : all;
  };

  return {
    listGoals,
    createGoal: ({ title, description }: { title: string; description?: string }) => {
      const active = listGoals({ status: "active" }).length;
      if (active >= 5) {
        throw Object.assign(new Error("cap"), {
          code: "ACTIVE_GOAL_LIMIT_EXCEEDED",
          limit: 5,
          currentActive: active,
        });
      }
      const now = new Date().toISOString();
      const goal: Goal = { id: `G-MOCK-${next++}`, title, description, status: "active", createdAt: now, updatedAt: now };
      goals.set(goal.id, goal);
      return goal;
    },
    getGoal: (id: string) => goals.get(id) ?? null,
    updateGoal: (id: string, updates: { title?: string; description?: string }) => {
      const existing = goals.get(id);
      if (!existing) throw new Error(`Goal ${id} not found`);
      const updated: Goal = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      goals.set(id, updated);
      return updated;
    },
    archiveGoal: (id: string) => {
      const existing = goals.get(id);
      if (!existing) throw new Error(`Goal ${id} not found`);
      if (existing.status === "archived") return existing;
      const updated: Goal = { ...existing, status: "archived", updatedAt: new Date().toISOString() };
      goals.set(id, updated);
      return updated;
    },
    unarchiveGoal: (id: string) => {
      const existing = goals.get(id);
      if (!existing) throw new Error(`Goal ${id} not found`);
      if (existing.status === "active") return existing;
      const active = listGoals({ status: "active" }).length;
      if (active >= 5) {
        throw Object.assign(new Error("cap"), {
          code: "ACTIVE_GOAL_LIMIT_EXCEEDED",
          limit: 5,
          currentActive: active,
        });
      }
      const updated: Goal = { ...existing, status: "active", updatedAt: new Date().toISOString() };
      goals.set(id, updated);
      return updated;
    },
  };
}

describe("goals-routes", () => {
  let app: express.Express;

  beforeEach(() => {
    const goalStore = createMockGoalStore();
    const store = { getGoalStore: () => goalStore } as unknown as TaskStore;
    app = express();
    app.use(express.json());
    app.use("/api/goals", createGoalsRouter(store));
  });

  it("GET / returns empty goals", async () => {
    const response = await get(app, "/api/goals");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ goals: [] });
  });

  it("POST / creates and GET / lists", async () => {
    const created = await request(app, "POST", "/api/goals", JSON.stringify({ title: "Goal A" }), {
      "content-type": "application/json",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "Goal A", status: "active" });

    const listed = await get(app, "/api/goals");
    expect(listed.body).toEqual({ goals: [created.body] });
  });

  it("POST / validates missing title", async () => {
    const response = await request(app, "POST", "/api/goals", JSON.stringify({}), {
      "content-type": "application/json",
    });
    expect(response.status).toBe(400);
  });

  it("GET / validates and filters status", async () => {
    await request(app, "POST", "/api/goals", JSON.stringify({ title: "A" }), { "content-type": "application/json" });
    const createdB = await request(app, "POST", "/api/goals", JSON.stringify({ title: "B" }), { "content-type": "application/json" });
    await request(app, "POST", `/api/goals/${(createdB.body as Goal).id}/archive`);

    const active = await get(app, "/api/goals?status=active");
    expect((active.body as { goals: Goal[] }).goals).toHaveLength(1);

    const invalid = await get(app, "/api/goals?status=bogus");
    expect(invalid.status).toBe(400);
  });

  it("PATCH /:id updates and validates", async () => {
    const created = await request(app, "POST", "/api/goals", JSON.stringify({ title: "Old" }), { "content-type": "application/json" });
    const id = (created.body as Goal).id;

    const updated = await request(
      app,
      "PATCH",
      `/api/goals/${id}`,
      JSON.stringify({ title: "New", description: "Desc" }),
      { "content-type": "application/json" },
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ title: "New", description: "Desc" });

    const empty = await request(app, "PATCH", `/api/goals/${id}`, JSON.stringify({}), { "content-type": "application/json" });
    expect(empty.status).toBe(400);

    const unknown = await request(app, "PATCH", "/api/goals/G-UNKNOWN", JSON.stringify({ title: "X" }), {
      "content-type": "application/json",
    });
    expect(unknown.status).toBe(404);
  });

  it("archive is idempotent and unarchive works", async () => {
    const created = await request(app, "POST", "/api/goals", JSON.stringify({ title: "Archive me" }), { "content-type": "application/json" });
    const id = (created.body as Goal).id;

    const archived = await request(app, "POST", `/api/goals/${id}/archive`);
    expect(archived.status).toBe(200);
    expect((archived.body as Goal).status).toBe("archived");

    const archivedAgain = await request(app, "POST", `/api/goals/${id}/archive`);
    expect(archivedAgain.status).toBe(200);
    expect((archivedAgain.body as Goal).status).toBe("archived");

    const unarchived = await request(app, "POST", `/api/goals/${id}/unarchive`);
    expect(unarchived.status).toBe(200);
    expect((unarchived.body as Goal).status).toBe("active");

    const unknownArchive = await request(app, "POST", "/api/goals/G-UNKNOWN/archive");
    expect(unknownArchive.status).toBe(404);

    const unknown = await request(app, "POST", "/api/goals/G-UNKNOWN/unarchive");
    expect(unknown.status).toBe(404);
  });

  it("returns 409 for cap violations on create and unarchive", async () => {
    const seededIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const seeded = await request(app, "POST", "/api/goals", JSON.stringify({ title: `Goal ${i}` }), { "content-type": "application/json" });
      seededIds.push((seeded.body as Goal).id);
    }

    const createOverflow = await request(app, "POST", "/api/goals", JSON.stringify({ title: "Overflow" }), {
      "content-type": "application/json",
    });
    expect(createOverflow.status).toBe(409);
    expect(createOverflow.body).toMatchObject({
      details: { code: "ACTIVE_GOAL_LIMIT_EXCEEDED", limit: 5, currentActive: 5 },
    });

    const archived = await request(app, "POST", `/api/goals/${seededIds[0]}/archive`);
    expect(archived.status).toBe(200);

    const createdArchived = await request(app, "POST", "/api/goals", JSON.stringify({ title: "Will archive" }), {
      "content-type": "application/json",
    });
    const archivedId = (createdArchived.body as Goal).id;
    await request(app, "POST", `/api/goals/${archivedId}/archive`);
    await request(app, "POST", `/api/goals/${seededIds[0]}/unarchive`);

    const unarchiveOverflow = await request(app, "POST", `/api/goals/${archivedId}/unarchive`);
    expect(unarchiveOverflow.status).toBe(409);
    expect(unarchiveOverflow.body).toMatchObject({
      details: { code: "ACTIVE_GOAL_LIMIT_EXCEEDED", limit: 5, currentActive: 5 },
    });
  });
});
