import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setTaskCreatedHook } from "../task-creation-hooks.js";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("task creation hook", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(async () => {
    setTaskCreatedHook(undefined);
    await harness.beforeEach();
  });

  afterEach(async () => {
    setTaskCreatedHook(undefined);
    await harness.afterEach();
  });

  it("fires once for createTask and createTaskWithReservedId", async () => {
    const store = harness.store();
    const hook = vi.fn();
    setTaskCreatedHook(hook);

    const created = await store.createTask({ description: "a" });
    const reserved = await store.createTaskWithReservedId({ description: "b" }, { taskId: "FN-9101" });

    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: created.id }), store);
    expect(hook).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: reserved.id }), store);
  });

  async function moveToDone(taskId: string): Promise<void> {
    const store = harness.store();
    await store.moveTask(taskId, "todo");
    await store.moveTask(taskId, "in-progress");
    await store.moveTask(taskId, "in-review");
    await store.moveTask(taskId, "done");
  }

  it("fires for duplicateTask and refineTask", async () => {
    const store = harness.store();
    const source = await store.createTask({ description: "source", title: "Source" });
    await moveToDone(source.id);

    const hook = vi.fn();
    setTaskCreatedHook(hook);

    const duplicated = await store.duplicateTask(source.id);
    const refined = await store.refineTask(source.id, "please refine");

    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: duplicated.id }), store);
    expect(hook).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: refined.id }), store);
  });

  it("does not fire for applyReplicatedTaskCreate", async () => {
    const store = harness.store();
    const hook = vi.fn();
    setTaskCreatedHook(hook);

    await store.applyReplicatedTaskCreate({
      replicationVersion: 1,
      reservationId: "res-1",
      taskId: "FN-9102",
      sourceNodeId: "node-a",
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
      prompt: "# FN-9102\n\nreplicated\n",
      input: { description: "replicated", column: "triage" },
    });

    expect(hook).not.toHaveBeenCalled();
  });

  it("swallows sync and async hook failures and still returns tasks", async () => {
    const store = harness.store();
    setTaskCreatedHook(() => {
      throw new Error("boom");
    });

    const created = await store.createTask({ description: "a" });
    const duplicated = await store.duplicateTask(created.id);
    await moveToDone(created.id);
    const refined = await store.refineTask(created.id, "feedback");

    expect(created.id).toMatch(/^FN-/);
    expect(duplicated.id).toMatch(/^FN-/);
    expect(refined.id).toMatch(/^FN-/);

    setTaskCreatedHook(async () => {
      throw new Error("async boom");
    });

    const created2 = await store.createTask({ description: "b" });
    expect(created2.id).toMatch(/^FN-/);
  });

  it("can clear hook with undefined", async () => {
    const store = harness.store();
    const hook = vi.fn();
    setTaskCreatedHook(hook);
    setTaskCreatedHook(undefined);

    await store.createTask({ description: "a" });
    expect(hook).not.toHaveBeenCalled();
  });
});
