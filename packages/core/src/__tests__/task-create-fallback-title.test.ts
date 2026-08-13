import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_TASK_TITLE, MAX_TITLE_LENGTH } from "../ai/ai-summarize.js";
import { findSameAgentDuplicates } from "../duplicates/duplicate-intake.js";
import { isUnplannedSeedPrompt } from "../mesh/mesh-task-replication.js";
import { _createTaskInternalImpl, resolveCreatedTaskTitle } from "../task-store/task-creation.js";
import type { TaskStore } from "../store.js";

const fallbackDescription = "Engine decomposition subtask body";

const markdownCases = [
  ["### Heading title", "Heading title"],
  ["- Bullet title", "Bullet title"],
  ["1. Numbered title", "Numbered title"],
  ["> Quoted title", "Quoted title"],
  ["[ ] Checkbox title", "Checkbox title"],
] as const;

describe("resolveCreatedTaskTitle", () => {
  it("derives a title from a description when no usable title is supplied", () => {
    expect(resolveCreatedTaskTitle(undefined, fallbackDescription, "KB-9")).toBe(fallbackDescription);
    expect(resolveCreatedTaskTitle("   ", fallbackDescription, "KB-9")).toBe(fallbackDescription);

    for (const [description, expected] of markdownCases) {
      expect(resolveCreatedTaskTitle(undefined, description, "KB-9")).toBe(expected);
    }
  });

  it("truncates a description at a word boundary", () => {
    const title = resolveCreatedTaskTitle(undefined, "implement ".repeat(10), "KB-9");
    expect(title).toBe("implement implement implement implement implement");
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it("preserves a usable explicit title byte-identically", () => {
    expect(resolveCreatedTaskTitle("  Preserve This Exact Title  ", fallbackDescription, "KB-9"))
      .toBe("Preserve This Exact Title");
  });

  it("uses the description or final fallback when title drift normalization removes a title", () => {
    expect(resolveCreatedTaskTitle("FN-123", fallbackDescription, "KB-9")).toBe(fallbackDescription);
    expect(resolveCreatedTaskTitle(undefined, "FN-123", "KB-9")).toBe(FALLBACK_TASK_TITLE);
  });

  it("never returns an empty or whitespace-only title", () => {
    for (const [title, description] of [
      [undefined, ""],
      [" ", "\n\n"],
      ["FN-123", "FN-456"],
    ] as const) {
      expect(resolveCreatedTaskTitle(title, description, "KB-9").trim()).not.toBe("");
    }
  });
});

function makeFileTaskStore(root: string, created: unknown[]): TaskStore {
  return {
    backendMode: false,
    taskDir: (id: string) => join(root, id),
    maybeResolveTombstonedTaskId: async () => undefined,
    assertTaskIdAvailable: async () => undefined,
    atomicCreateTaskJson: async (_dir: string, task: unknown) => { created.push(task); },
    isWatching: false,
    generateSpecifiedPrompt: () => "",
    _maybeAutoArchiveSameAgentDuplicate: async () => undefined,
    emitTaskLifecycleEventSafely: () => undefined,
    invokeTaskCreatedHook: async () => undefined,
  } as unknown as TaskStore;
}

describe("file task creation fallback title", () => {
  it("persists the resolved title and writes a matching unplanned bootstrap seed", async () => {
    const root = await mkdtemp(join(tmpdir(), "fusion-task-create-title-"));
    const created: unknown[] = [];
    const store = makeFileTaskStore(root, created);
    const id = "KB-CREATE-FALLBACK";

    try {
      const task = await _createTaskInternalImpl(
        store,
        { description: fallbackDescription, column: "triage", workflowId: null },
        undefined,
        undefined,
        id,
        { resolvedEntryColumn: "triage", invokeTaskCreatedHook: false },
      );
      const prompt = await readFile(join(root, id, "PROMPT.md"), "utf8");

      expect(task.title).toBe(fallbackDescription);
      expect(created).toEqual([task]);
      expect(isUnplannedSeedPrompt(prompt, id, task.title, task.description)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves explicit titles and derives replacements for drift-only titles", async () => {
    const root = await mkdtemp(join(tmpdir(), "fusion-task-create-title-"));
    const created: unknown[] = [];
    const store = makeFileTaskStore(root, created);

    try {
      const explicit = await _createTaskInternalImpl(
        store,
        { description: fallbackDescription, title: "Explicit title", column: "triage", workflowId: null },
        "Explicit title",
        undefined,
        "KB-CREATE-EXPLICIT",
        { resolvedEntryColumn: "triage", invokeTaskCreatedHook: false },
      );
      const driftOnly = await _createTaskInternalImpl(
        store,
        { description: fallbackDescription, title: "FN-123", column: "triage", workflowId: null },
        "FN-123",
        undefined,
        "KB-9",
        { resolvedEntryColumn: "triage", invokeTaskCreatedHook: false },
      );

      expect(explicit.title).toBe("Explicit title");
      expect(driftOnly.title).toBe(fallbackDescription);
      expect(created).toEqual([explicit, driftOnly]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fallback titles and same-agent duplicates", () => {
  it("keeps same-description creates eligible for duplicate matching", () => {
    const nowMs = Date.now();
    const title = resolveCreatedTaskTitle(undefined, fallbackDescription, "KB-9");
    const matches = findSameAgentDuplicates(
      { title, description: fallbackDescription },
      [{
        id: "KB-OLDER",
        title,
        description: fallbackDescription,
        column: "todo",
        createdAt: nowMs - 1_000,
        sourceAgentId: "agent-create",
      }],
      { nowMs, sourceAgentId: "agent-create" },
    );

    expect(matches.map((match) => match.id)).toEqual(["KB-OLDER"]);
  });
});
