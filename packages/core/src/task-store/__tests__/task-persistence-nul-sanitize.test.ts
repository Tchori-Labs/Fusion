import { describe, expect, it } from "vitest";
import type { Task } from "../../types.js";
import { TASK_COLUMN_DESCRIPTORS } from "../persistence.js";

function descriptorFor(column: "title" | "description") {
  const descriptor = TASK_COLUMN_DESCRIPTORS.find((entry) => entry.column === column);
  if (!descriptor) {
    throw new Error(`Missing ${column} task persistence descriptor`);
  }
  return descriptor;
}

function serialize(column: "title" | "description", task: Partial<Task>): unknown {
  return descriptorFor(column).serialize(task as Task, { lineageId: "lineage-test" });
}

describe("task title and description persistence NUL sanitization", () => {
  it("strips embedded NUL bytes while preserving surrounding text", () => {
    const contaminated = "before\u0000fnlvl=info\u0000after";

    expect(serialize("title", { title: contaminated })).toBe("beforefnlvl=infoafter");
    expect(serialize("description", { description: contaminated })).toBe("beforefnlvl=infoafter");
  });

  it("preserves clean strings by reference for Object.is row diffing", () => {
    const cleanTitle = "clean title";
    const cleanDescription = "clean description";

    expect(serialize("title", { title: cleanTitle })).toBe(cleanTitle);
    expect(serialize("description", { description: cleanDescription })).toBe(cleanDescription);
  });

  it("retains existing title and description fallbacks", () => {
    expect(serialize("title", {})).toBeNull();
    expect(serialize("title", { title: null })).toBeNull();
    expect(serialize("description", {})).toBe("");
  });

  it("collapses NUL-only text to an empty string", () => {
    expect(serialize("title", { title: "\u0000\u0000" })).toBe("");
    expect(serialize("description", { description: "\u0000\u0000" })).toBe("");
  });
});
