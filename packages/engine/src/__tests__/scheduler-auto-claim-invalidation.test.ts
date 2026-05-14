import { describe, expect, it, vi } from "vitest";
import type { TaskStore } from "@fusion/core";
import { Scheduler } from "../scheduler.js";

function createStore() {
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  const on = vi.fn((event: string, listener: (payload: unknown) => void) => {
    const existing = listeners.get(event) ?? [];
    existing.push(listener);
    listeners.set(event, existing);
  });

  const store = {
    on,
    off: vi.fn(),
  } as unknown as TaskStore;

  const emit = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(payload);
    }
  };

  return { store, emit };
}

describe("Scheduler auto-claim snapshot invalidation", () => {
  it("invalidates on task:created and task:updated", () => {
    const invalidate = vi.fn();
    const { store, emit } = createStore();
    new Scheduler(store, { snapshotManager: { invalidate } as any });

    emit("task:created", { task: { id: "FN-1" } });
    emit("task:updated", { id: "FN-1" });

    expect(invalidate).toHaveBeenCalledWith("task:created");
    expect(invalidate).toHaveBeenCalledWith("task:updated");
  });

  it("invalidates task:moved only when todo is source or destination", () => {
    const invalidate = vi.fn();
    const { store, emit } = createStore();
    new Scheduler(store, { snapshotManager: { invalidate } as any });

    emit("task:moved", { task: { id: "FN-1" }, from: "todo", to: "in-progress" });
    emit("task:moved", { task: { id: "FN-2" }, from: "in-progress", to: "todo" });
    emit("task:moved", { task: { id: "FN-3" }, from: "in-review", to: "done" });

    expect(invalidate).toHaveBeenCalledWith("task:moved:todo->in-progress");
    expect(invalidate).toHaveBeenCalledWith("task:moved:in-progress->todo");
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
