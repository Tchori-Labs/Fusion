import { describe, expect, it } from "vitest";
import type { RunAuditEventInput, TaskStore } from "@fusion/core";
import { __runConfiguredCommandForTests } from "../executor.js";
import { __executePostMergeScriptStepForTests } from "../merger.js";
import { createRunAuditor } from "../run-audit.js";

class AuditStoreStub {
  events: RunAuditEventInput[] = [];
  recordRunAuditEvent(event: RunAuditEventInput): void {
    this.events.push(event);
  }
}

describe("sandbox wiring audit emissions", () => {
  it("emits sandbox:run on successful configured command", async () => {
    const store = new AuditStoreStub();
    const auditor = createRunAuditor(store as unknown as TaskStore, {
      runId: "run-exec-1",
      agentId: "executor",
      taskId: "FN-4640",
      phase: "execute",
    });

    const result = await __runConfiguredCommandForTests("node -e \"process.stdout.write('ok')\"", process.cwd(), 20_000, undefined, auditor);
    expect(result.exitCode).toBe(0);

    expect(store.events.some((event) => event.domain === "sandbox" && event.mutationType === "sandbox:run")).toBe(true);
  });

  it("emits sandbox:failure when configured command exits non-zero", async () => {
    const store = new AuditStoreStub();
    const auditor = createRunAuditor(store as unknown as TaskStore, {
      runId: "run-exec-2",
      agentId: "executor",
      taskId: "FN-4640",
      phase: "execute",
    });

    await __runConfiguredCommandForTests("node -e \"process.exit(7)\"", process.cwd(), 20_000, undefined, auditor);

    expect(store.events.some((event) => event.domain === "sandbox" && event.mutationType === "sandbox:failure")).toBe(true);
  });

  it("emits sandbox:run for merger script-mode execution", async () => {
    const store = new AuditStoreStub();
    const auditor = createRunAuditor(store as unknown as TaskStore, {
      runId: "run-merge-1",
      agentId: "merger",
      taskId: "FN-4640",
      phase: "merge",
    });

    const response = await __executePostMergeScriptStepForTests(
      {} as TaskStore,
      "FN-4640",
      { id: "ws-1", name: "post", type: "script", scriptName: "ok" } as any,
      process.cwd(),
      { scripts: { ok: "node -e \"process.stdout.write('ok')\"" } } as any,
      auditor,
    );

    expect(response.success).toBe(true);
    expect(store.events.some((event) => event.domain === "sandbox" && event.mutationType === "sandbox:run")).toBe(true);
  });
});
