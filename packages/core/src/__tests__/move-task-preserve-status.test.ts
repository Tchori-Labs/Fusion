import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore moveTask preserveStatus", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  it("clears status/error by default when moving in-progress to todo", async () => {
    const task = await harness.store().createTask({ description: "preserveStatus default clear" });
    await harness.store().moveTask(task.id, "todo");
    await harness.store().moveTask(task.id, "in-progress");
    await harness.store().updateTask(task.id, {
      status: "failed",
      error: "boom",
    });

    const moved = await harness.store().moveTask(task.id, "todo");
    expect(moved.status).toBeUndefined();
    expect(moved.error).toBeUndefined();
  });

  it("preserves status/error when preserveStatus is true on in-progress to todo", async () => {
    const task = await harness.store().createTask({ description: "preserveStatus true in-progress" });
    await harness.store().moveTask(task.id, "todo");
    await harness.store().moveTask(task.id, "in-progress");
    await harness.store().updateTask(task.id, {
      status: "failed",
      error: "branch conflict",
    });

    const moved = await harness.store().moveTask(task.id, "todo", { preserveStatus: true });
    expect(moved.status).toBe("failed");
    expect(moved.error).toBe("branch conflict");
  });

  it("preserves status/error on in-review to todo when preserveStatus is true", async () => {
    const task = await harness.store().createTask({ description: "preserveStatus true in-review" });
    await harness.store().moveTask(task.id, "todo");
    await harness.store().moveTask(task.id, "in-progress");
    await harness.store().moveTask(task.id, "in-review");
    await harness.store().updateTask(task.id, {
      status: "failed",
      error: "recovery exhausted",
    });

    const moved = await harness.store().moveTask(task.id, "todo", { preserveStatus: true });
    expect(moved.status).toBe("failed");
    expect(moved.error).toBe("recovery exhausted");
  });
});
