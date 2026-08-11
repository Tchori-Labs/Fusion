import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  createSharedPgTaskStoreTestHarness,
  pgDescribe,
  type SharedPgTaskStoreHarness,
} from "../../__test-utils__/pg-test-harness.js";

const pgTest = pgDescribe;
const fallbackDescription = "Engine decomposition subtask body";
const longDescription = "summarize this description into a concise task title ".repeat(6);

pgTest("TaskStore creation fallback titles (PostgreSQL)", () => {
  const h: SharedPgTaskStoreHarness = createSharedPgTaskStoreTestHarness({
    prefix: "fusion_create_fallback_title",
  });

  beforeAll(h.beforeAll);
  beforeEach(h.beforeEach);
  afterEach(h.afterEach);
  afterAll(h.afterAll);

  it("creates a non-empty title that survives store reads", async () => {
    const store = h.store();
    const task = await store.createTask({ description: fallbackDescription });

    expect(task.title).toBe(fallbackDescription);
    expect((await store.getTask(task.id))?.title).toBe(fallbackDescription);
    expect((await store.listTasks()).find((candidate) => candidate.id === task.id)?.title)
      .toBe(fallbackDescription);
  });

  it("preserves explicit titles and assigns a title to reserved-id creates", async () => {
    const store = h.store();
    const explicit = await store.createTask({ title: "Explicit imported title", description: fallbackDescription });
    const reserved = await store.createTaskWithReservedId(
      { description: fallbackDescription },
      { taskId: "KB-RESERVED-FALLBACK" },
    );

    expect(explicit.title).toBe("Explicit imported title");
    expect(reserved.title).toBe(fallbackDescription);
    expect((await store.getTask(reserved.id))?.title).toBe(fallbackDescription);
  });

  it("replaces only the derived placeholder after a successful deferred summarization", async () => {
    const store = h.store();
    const task = await store.createTask(
      { description: longDescription },
      {
        settings: { autoSummarizeTitles: true },
        onSummarize: async () => "Summarized creation title",
      },
    );

    expect(task.title).not.toBe("Summarized creation title");
    await vi.waitFor(async () => {
      expect((await store.getTask(task.id))?.title).toBe("Summarized creation title");
    });
  });

  it("retains the derived placeholder when deferred summarization returns no title or fails", async () => {
    const store = h.store();
    const nullResult = await store.createTask(
      { description: longDescription },
      {
        settings: { autoSummarizeTitles: true },
        onSummarize: async () => null,
      },
    );
    const failedResult = await store.createTask(
      { description: longDescription },
      {
        settings: { autoSummarizeTitles: true },
        onSummarize: async () => { throw new Error("summarizer unavailable"); },
      },
    );

    await Promise.allSettled([...store.deferredTaskCreatedWork]);
    expect((await store.getTask(nullResult.id))?.title).toBe(taskFallbackTitle());
    expect((await store.getTask(failedResult.id))?.title).toBe(taskFallbackTitle());
  });
});

function taskFallbackTitle(): string {
  return "summarize this description into a concise task title";
}
