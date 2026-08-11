import { describe, expect, it, vi } from "vitest";
import type { TaskStore } from "@fusion/core";
import {
  assertExplicitImportProject,
  assertImportedTaskPersisted,
  countRegisteredProjects,
} from "../routes/github-import-project-scope.js";

describe("GitHub import project-scope guard", () => {
  it("rejects an omitted or whitespace-normalized project id when more than one project exists", () => {
    expect(() => assertExplicitImportProject({
      explicitProjectId: undefined,
      registeredProjectCount: 2,
      route: "POST /api/github/issues/import",
    })).toThrow(/requires projectId/u);
    expect(() => assertExplicitImportProject({
      explicitProjectId: undefined,
      registeredProjectCount: 1,
      route: "POST /api/github/issues/import",
    })).not.toThrow();
  });

  it("counts a shared central registry and fails open when it is unavailable", async () => {
    const central = {
      isInitialized: () => true,
      init: vi.fn(),
      close: vi.fn(),
      listProjects: vi.fn().mockResolvedValue([{ id: "one" }, { id: "two" }]),
    };
    expect(await countRegisteredProjects({ centralCore: central } as never)).toBe(2);
    expect(central.close).not.toHaveBeenCalled();

    central.listProjects.mockRejectedValueOnce(new Error("registry unavailable"));
    expect(await countRegisteredProjects({ centralCore: central } as never)).toBe(0);
  });

  it("returns only a task proven readable from the target store", async () => {
    const persisted = { id: "KB-011", description: "persisted" };
    const store = { getTask: vi.fn().mockResolvedValue(persisted) } as unknown as TaskStore;
    await expect(assertImportedTaskPersisted(store, "KB-011", "named-project")).resolves.toBe(persisted);

    (store.getTask as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    await expect(assertImportedTaskPersisted(store, "KB-012", "named-project")).rejects.toMatchObject({
      statusCode: 500,
      details: { code: "IMPORT_NOT_PERSISTED", taskId: "KB-012", projectId: "named-project" },
    });
  });
});
