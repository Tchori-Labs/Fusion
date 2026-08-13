import { describe, expect, it } from "vitest";
import {
  createTaskStoreForTest,
  pgDescribe,
  type PgTestHarness,
} from "../../__test-utils__/pg-test-harness.js";

pgDescribe("task title and description NUL sanitization (PostgreSQL)", () => {
  let harness: PgTestHarness | null = null;

  async function makeHarness(): Promise<PgTestHarness> {
    harness = await createTaskStoreForTest({ prefix: "fusion_nul_sanitize" });
    return harness;
  }

  async function teardown(): Promise<void> {
    if (harness) {
      await harness.teardown();
      harness = null;
    }
  }

  it("strips embedded NUL bytes when creating a task", async () => {
    const h = await makeHarness();
    try {
      const task = await h.store.createTask({
        title: "before\u0000fnlvl=info\u0000after",
        description: "before\u0000fnlvl=info\u0000after",
      });

      expect(task.title).toBe("beforefnlvl=infoafter");
      expect(task.description).toBe("beforefnlvl=infoafter");
      await expect(h.store.getTask(task.id)).resolves.toMatchObject({
        title: "beforefnlvl=infoafter",
        description: "beforefnlvl=infoafter",
      });
    } finally {
      await teardown();
    }
  });

  it("strips embedded NUL bytes when updating a task", async () => {
    const h = await makeHarness();
    try {
      const task = await h.store.createTask({
        title: "clean title",
        description: "clean description",
      });
      const updated = await h.store.updateTask(task.id, {
        title: "updated\u0000fnlvl=info\u0000title",
        description: "updated\u0000fnlvl=info\u0000description",
      });

      expect(updated).toMatchObject({
        title: "updatedfnlvl=infotitle",
        description: "updatedfnlvl=infodescription",
      });
      await expect(h.store.getTask(task.id)).resolves.toMatchObject({
        title: "updatedfnlvl=infotitle",
        description: "updatedfnlvl=infodescription",
      });
    } finally {
      await teardown();
    }
  });

  it("round-trips NUL-free title and description byte-identically", async () => {
    const h = await makeHarness();
    try {
      const title = "Clean title: ✓";
      const description = "Clean description with emoji 🚀 and newline\nintact.";
      const task = await h.store.createTask({ title, description });

      expect(task).toMatchObject({ title, description });
      await expect(h.store.getTask(task.id)).resolves.toMatchObject({ title, description });
    } finally {
      await teardown();
    }
  });
});

// Keep `describe` referenced when pgDescribe resolves to describe.skip.
void describe;
