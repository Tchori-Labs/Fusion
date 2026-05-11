import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { TaskStore } from "../store.js";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore RunMutationContext", () => {
  const harness = createTaskStoreTestHarness();
  let store: TaskStore;

  beforeEach(async () => {
    await harness.beforeEach();
    store = harness.store();
  });

  afterEach(async () => {
    await harness.afterEach();
  });

  describe("RunMutationContext", () => {
    it("logEntry() with runContext includes runContext field", async () => {
      const task = await store.createTask({ description: "Test task" });
      const runContext = { runId: "run-123", agentId: "agent-456" };

      await store.logEntry(task.id, "Test action", "Test outcome", runContext);

      const updatedTask = await store.getTask(task.id);
      expect(updatedTask.log).toHaveLength(2);
      const lastEntry = updatedTask.log[updatedTask.log.length - 1];
      expect(lastEntry.runContext).toEqual(runContext);
      expect(lastEntry.action).toBe("Test action");
      expect(lastEntry.outcome).toBe("Test outcome");
    });

    it("logEntry() without runContext has no runContext field (backward compat)", async () => {
      const task = await store.createTask({ description: "Test task" });
      await store.logEntry(task.id, "Test action", "Test outcome");

      const updatedTask = await store.getTask(task.id);
      expect(updatedTask.log).toHaveLength(2);
      const lastEntry = updatedTask.log[updatedTask.log.length - 1];
      expect(lastEntry.runContext).toBeUndefined();
      expect(lastEntry.action).toBe("Test action");
    });

    it("logEntry() bounds retained activity entries and truncates large outcomes", async () => {
      const task = await store.createTask({ description: "Test task" });
      const longOutcome = "x".repeat(5_000);

      for (let index = 0; index < 1_005; index += 1) {
        await store.logEntry(task.id, `Action ${index}`, index === 1_004 ? longOutcome : undefined);
      }

      const updatedTask = await store.getTask(task.id);
      expect(updatedTask.log).toHaveLength(1_000);
      expect(updatedTask.log[0].action).toBe("Action 5");
      const lastEntry = updatedTask.log[updatedTask.log.length - 1];
      expect(lastEntry.action).toBe("Action 1004");
      expect(lastEntry.outcome?.length).toBeLessThan(longOutcome.length);
      expect(lastEntry.outcome).toContain("outcome truncated");
    }, 180_000);

    it("addComment() with runContext includes runContext in log entry", async () => {
      const task = await store.createTask({ description: "Test task" });
      const runContext = { runId: "run-789", agentId: "agent-101" };

      await store.addComment(task.id, "Test comment", "user", undefined, runContext);

      const updatedTask = await store.getTask(task.id);
      expect(updatedTask.comments).toHaveLength(1);
      expect(updatedTask.comments![0].text).toBe("Test comment");
      expect(updatedTask.log).toHaveLength(2);
      const lastEntry = updatedTask.log[updatedTask.log.length - 1];
      expect(lastEntry.runContext).toEqual(runContext);
    });

    it("addSteeringComment() forwards runContext to addComment", async () => {
      const task = await store.createTask({ description: "Test task" });
      const runContext = { runId: "run-abc", agentId: "agent-def", source: "timer" };

      await store.addSteeringComment(task.id, "Steering comment", "agent", runContext);

      const updatedTask = await store.getTask(task.id);
      expect(updatedTask.steeringComments).toHaveLength(1);
      expect(updatedTask.steeringComments![0].text).toBe("Steering comment");
      expect(updatedTask.log).toHaveLength(2);
      const lastEntry = updatedTask.log[updatedTask.log.length - 1];
      expect(lastEntry.runContext).toEqual(runContext);
    });

    it("getMutationsForRun(runId) returns only entries matching the runId, sorted by timestamp", async () => {
      const task1 = await store.createTask({ description: "Task 1" });
      const task2 = await store.createTask({ description: "Task 2" });

      await store.logEntry(task1.id, "Action 1", undefined, { runId: "run-target", agentId: "agent-1" });
      await new Promise((r) => setTimeout(r, 10));
      await store.logEntry(task2.id, "Action 2", undefined, { runId: "run-target", agentId: "agent-1" });
      await new Promise((r) => setTimeout(r, 10));
      await store.logEntry(task1.id, "Action 3", undefined, { runId: "run-other", agentId: "agent-2" });

      const mutations = await store.getMutationsForRun("run-target");

      expect(mutations).toHaveLength(2);
      expect(mutations.map((m) => m.action)).toEqual(["Action 1", "Action 2"]);
      expect(new Date(mutations[0].timestamp).getTime()).toBeLessThan(new Date(mutations[1].timestamp).getTime());
    });

    it("getMutationsForRun(unknownRunId) returns empty array", async () => {
      const task = await store.createTask({ description: "Test task" });
      await store.logEntry(task.id, "Some action", undefined, { runId: "run-existing", agentId: "agent-1" });

      const mutations = await store.getMutationsForRun("run-does-not-exist");

      expect(mutations).toEqual([]);
    });

    it("getMutationsForRun() collects entries across multiple tasks", async () => {
      const task1 = await store.createTask({ description: "Task 1" });
      const task2 = await store.createTask({ description: "Task 2" });
      const task3 = await store.createTask({ description: "Task 3" });

      await store.logEntry(task1.id, "Entry 1", undefined, { runId: "run-shared", agentId: "agent-x" });
      await store.logEntry(task2.id, "Entry 2", undefined, { runId: "run-shared", agentId: "agent-x" });
      await store.logEntry(task3.id, "Entry 3", undefined, { runId: "run-other", agentId: "agent-y" });

      const mutations = await store.getMutationsForRun("run-shared");

      expect(mutations).toHaveLength(2);
      expect(mutations.map((m) => m.action).sort()).toEqual(["Entry 1", "Entry 2"]);
    });
  });
});
