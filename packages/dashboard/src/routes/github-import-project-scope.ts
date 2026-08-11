import { CentralCore, type Task, type TaskStore } from "@fusion/core";
import { ApiError } from "../api-error.js";
import type { ServerOptions } from "../server.js";

/**
 * FNXC:GithubImport 2026-08-11-10:34:
 * A task-creating GitHub import cannot guess the launch project when multiple projects are
 * registered. Registry failure deliberately preserves single-project compatibility by failing open.
 */
export async function countRegisteredProjects(options?: ServerOptions): Promise<number> {
  const sharedCentral = options?.centralCore;
  const shouldClose = !sharedCentral;
  const central = sharedCentral ?? new CentralCore();

  try {
    if (!sharedCentral || (typeof central.isInitialized === "function" && !central.isInitialized())) {
      await central.init();
    }
    return (await central.listProjects()).length;
  } catch {
    return 0;
  } finally {
    if (shouldClose) {
      try {
        await central.close();
      } catch {
        // Best-effort close after a failed registry lookup.
      }
    }
  }
}

/**
 * FNXC:GithubImport 2026-08-11-10:34:
 * Once an instance has multiple registered projects, import callers must name their target instead
 * of silently creating work in the daemon launch project.
 */
export function assertExplicitImportProject(input: {
  explicitProjectId: string | undefined;
  registeredProjectCount: number;
  route: string;
}): void {
  if (!input.explicitProjectId && input.registeredProjectCount > 1) {
    throw new ApiError(400, `${input.route} requires projectId when multiple projects are registered`, {
      code: "PROJECT_ID_REQUIRED",
      registeredProjectCount: input.registeredProjectCount,
    });
  }
}

/**
 * FNXC:GithubImport 2026-08-11-10:34:
 * An import response must only claim success after a target-project read-back proves createTask
 * persisted the task; returning the transient create result masked lost imports.
 */
export async function assertImportedTaskPersisted(
  store: TaskStore,
  taskId: string,
  projectId: string | undefined,
): Promise<Task> {
  const task = await store.getTask(taskId);
  if (!task) {
    throw new ApiError(500, "GitHub import task was not persisted", {
      code: "IMPORT_NOT_PERSISTED",
      taskId,
      projectId,
    });
  }
  return task;
}
