import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";
import { mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MEMORY_FILE_PATH,
  memoryFilePath,
  getDefaultMemoryScaffold,
  ensureMemoryFile,
  ensureMemoryFileWithBackend,
  buildTriageMemoryInstructions,
  buildExecutionMemoryInstructions,
  readProjectMemory,
  readProjectMemoryWithBackend,
} from "./project-memory.js";

describe("project-memory", () => {
  let testDir: string;
  let memoryPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `kb-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    memoryPath = join(testDir, ".fusion", "memory.md");
    // Create the test directory but not the .fusion subdirectory
    // Individual tests can create .fusion as needed
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up entire test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  // ── Constants ────────────────────────────────────────────────────

  describe("MEMORY_FILE_PATH", () => {
    it("is a relative path under .fusion", () => {
      expect(MEMORY_FILE_PATH).toBe(".fusion/memory.md");
    });
  });

  describe("memoryFilePath", () => {
    it("returns absolute path joining root and relative path", () => {
      expect(memoryFilePath("/project")).toBe("/project/.fusion/memory.md");
    });
  });

  // ── Default Scaffold ──────────────────────────────────────────────

  describe("getDefaultMemoryScaffold", () => {
    it("returns non-empty markdown content", () => {
      const scaffold = getDefaultMemoryScaffold();
      expect(scaffold.length).toBeGreaterThan(0);
    });

    it("contains expected section headings", () => {
      const scaffold = getDefaultMemoryScaffold();
      expect(scaffold).toContain("## Architecture");
      expect(scaffold).toContain("## Conventions");
      expect(scaffold).toContain("## Pitfalls");
      expect(scaffold).toContain("## Context");
    });

    it("starts with a top-level heading", () => {
      const scaffold = getDefaultMemoryScaffold();
      expect(scaffold).toMatch(/^# Project Memory/);
    });
  });

  // ── ensureMemoryFile ──────────────────────────────────────────────

  describe("ensureMemoryFile", () => {
    it("creates the memory file when it does not exist", async () => {
      const created = await ensureMemoryFile(testDir);
      expect(created).toBe(true);
      expect(existsSync(memoryFilePath(testDir))).toBe(true);
    });

    it("writes the default scaffold content", async () => {
      await ensureMemoryFile(testDir);
      const content = await readProjectMemory(testDir);
      expect(content).toBe(getDefaultMemoryScaffold());
    });

    it("creates the .fusion directory if missing", async () => {
      expect(existsSync(join(testDir, ".fusion"))).toBe(false);
      await ensureMemoryFile(testDir);
      expect(existsSync(join(testDir, ".fusion"))).toBe(true);
    });

    it("does not overwrite existing content", async () => {
      // Create initial file
      await ensureMemoryFile(testDir);

      // Manually edit the content
      const { writeFile } = await import("node:fs/promises");
      const customContent = "# Custom Memory\n\nMy custom content";
      await writeFile(memoryFilePath(testDir), customContent, "utf-8");

      // Ensure again — should NOT overwrite
      const created = await ensureMemoryFile(testDir);
      expect(created).toBe(false);

      const content = await readProjectMemory(testDir);
      expect(content).toBe(customContent);
    });

    it("returns false when file already exists with scaffold", async () => {
      await ensureMemoryFile(testDir);
      const created = await ensureMemoryFile(testDir);
      expect(created).toBe(false);
    });

    it("is idempotent — multiple calls produce same result", async () => {
      await ensureMemoryFile(testDir);
      await ensureMemoryFile(testDir);
      await ensureMemoryFile(testDir);

      const content = await readProjectMemory(testDir);
      expect(content).toBe(getDefaultMemoryScaffold());
    });
  });

  // ── readProjectMemory ─────────────────────────────────────────────

  describe("readProjectMemory", () => {
    it("returns empty string when file does not exist", async () => {
      const content = await readProjectMemory(testDir);
      expect(content).toBe("");
    });

    it("returns file content when file exists", async () => {
      await ensureMemoryFile(testDir);
      const content = await readProjectMemory(testDir);
      expect(content).toContain("# Project Memory");
    });
  });

  // ── buildTriageMemoryInstructions ─────────────────────────────────

  describe("buildTriageMemoryInstructions", () => {
    it("returns non-empty string", () => {
      const instructions = buildTriageMemoryInstructions(testDir);
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("contains the memory file path", () => {
      const instructions = buildTriageMemoryInstructions(testDir);
      expect(instructions).toContain(".fusion/memory.md");
    });

    it("instructs agent to read the memory file", () => {
      const instructions = buildTriageMemoryInstructions(testDir);
      expect(instructions).toMatch(/read.*memory\.md/i);
    });

    it("instructs agent to incorporate learnings", () => {
      const instructions = buildTriageMemoryInstructions(testDir);
      expect(instructions).toMatch(/incorporate.*learning|reference.*pattern/i);
    });
  });

  // ── buildExecutionMemoryInstructions ──────────────────────────────

  describe("buildExecutionMemoryInstructions", () => {
    it("returns non-empty string", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("contains the memory file path", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      expect(instructions).toContain(".fusion/memory.md");
    });

    it("instructs agent to read memory at start", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      expect(instructions).toMatch(/start of execution/i);
      expect(instructions).toMatch(/read.*memory\.md/i);
    });

    it("instructs agent to selectively write learnings at end", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      expect(instructions).toMatch(/end of execution|before calling.*task_done/i);
      // Should mention selective/skip behavior, not just append
      expect(instructions).toMatch(/skip.*memory.*update|selectively|durable.*learnings/i);
    });

    it("instructs agent to skip when nothing durable was learned", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      // Should explicitly allow skipping when nothing durable was learned
      expect(instructions).toMatch(/skip.*memory.*update|nothing durable|if nothing/i);
    });

    it("instructs agent to avoid task-specific trivia", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      // Should explicitly forbid task-specific trivia
      expect(instructions).toMatch(/avoid.*trivia|task-specific.*trivia|per-task.*log|changelog/i);
    });

    it("allows editing/consolidating existing entries", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      // Should allow consolidation/editing, not forbid it
      expect(instructions).toMatch(/consolidate|update.*refine.*existing|edit.*existing/i);
    });

    it("specifies project-root path not worktree-local", () => {
      const instructions = buildExecutionMemoryInstructions(testDir);
      // Should use .fusion/memory.md (project root relative) not absolute worktree paths
      expect(instructions).toContain("`.fusion/memory.md`");
    });
  });

  // ── ensureMemoryFileWithBackend ─────────────────────────────────────

  describe("ensureMemoryFileWithBackend", () => {
    it("creates memory file with default backend when memory does not exist", async () => {
      // Ensure clean state - create .fusion dir if needed
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);
      expect(existsSync(memoryPath)).toBe(false);

      const created = await ensureMemoryFileWithBackend(testDir);

      expect(created).toBe(true);
      expect(existsSync(memoryPath)).toBe(true);
      const content = readFileSync(memoryPath, "utf-8");
      expect(content).toBe(getDefaultMemoryScaffold());
    });

    it("does not overwrite existing memory content", async () => {
      // Create initial file with custom content
      await ensureMemoryFile(testDir);
      const customContent = "# Custom Memory\n\nMy custom content";
      await writeFile(memoryPath, customContent, "utf-8");

      // Ensure again with backend - should NOT overwrite
      const created = await ensureMemoryFileWithBackend(testDir);
      expect(created).toBe(false);

      const content = readFileSync(memoryPath, "utf-8");
      expect(content).toBe(customContent);
    });

    it("returns false when file already exists", async () => {
      await ensureMemoryFile(testDir);
      const created = await ensureMemoryFileWithBackend(testDir);
      expect(created).toBe(false);
    });

    it("works with file backend type in settings", async () => {
      // Ensure clean state
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);

      const settings = { memoryBackendType: "file" };
      const created = await ensureMemoryFileWithBackend(testDir, settings);

      expect(created).toBe(true);
      expect(existsSync(memoryPath)).toBe(true);
    });

    it("does not throw for readonly backend (non-fatal bootstrap)", async () => {
      // Ensure .fusion dir exists but no memory file
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);

      const settings = { memoryBackendType: "readonly" };
      
      // Should not throw - readonly backend is non-fatal during bootstrap
      const result = await ensureMemoryFileWithBackend(testDir, settings);

      // Should return false since readonly can't write
      expect(result).toBe(false);
    });
  });

  // ── readProjectMemoryWithBackend ─────────────────────────────────────

  describe("readProjectMemoryWithBackend", () => {
    it("returns empty string when memory does not exist", async () => {
      // Ensure clean state
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);
      expect(existsSync(memoryPath)).toBe(false);

      const content = await readProjectMemoryWithBackend(testDir);
      expect(content).toBe("");
    });

    it("returns memory content when file exists", async () => {
      await ensureMemoryFile(testDir);
      const content = await readProjectMemoryWithBackend(testDir);
      expect(content).toContain("# Project Memory");
    });

    it("returns custom content when file has been edited", async () => {
      await ensureMemoryFile(testDir);
      const customContent = "# Custom Memory\n\nSome custom content";
      await writeFile(memoryPath, customContent, "utf-8");

      const content = await readProjectMemoryWithBackend(testDir);
      expect(content).toBe(customContent);
    });

    it("works with file backend type in settings", async () => {
      await ensureMemoryFile(testDir);
      const settings = { memoryBackendType: "file" };
      const content = await readProjectMemoryWithBackend(testDir, settings);
      expect(content).toContain("# Project Memory");
    });

    it("returns empty string for readonly backend", async () => {
      // Ensure clean state
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);

      const settings = { memoryBackendType: "readonly" };
      const content = await readProjectMemoryWithBackend(testDir, settings);
      // Readonly backend always returns empty content
      expect(content).toBe("");
    });

    it("returns empty string on read error (graceful degradation)", async () => {
      // Ensure clean state
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);

      const settings = { memoryBackendType: "nonexistent" };
      // Unknown backend should fall back gracefully
      const content = await readProjectMemoryWithBackend(testDir, settings);
      expect(content).toBe("");
    });
  });

  // ── Backend-aware bootstrap integration ─────────────────────────────

  describe("backend-aware bootstrap integration", () => {
    it("idempotent bootstrap preserves user edits regardless of backend", async () => {
      // Create file with default backend
      await ensureMemoryFile(testDir);
      
      // Edit the content
      const customContent = "# User Edit\n\nI modified this";
      await writeFile(memoryPath, customContent, "utf-8");

      // Bootstrap again with different backends - none should overwrite
      await ensureMemoryFileWithBackend(testDir, { memoryBackendType: "file" });
      expect(readFileSync(memoryPath, "utf-8")).toBe(customContent);

      // Readonly should also preserve (even though it can't write)
      await ensureMemoryFileWithBackend(testDir, { memoryBackendType: "readonly" });
      expect(readFileSync(memoryPath, "utf-8")).toBe(customContent);
    });

    it("backend selection is honored for new memory creation with file backend", async () => {
      // Ensure clean state
      await mkdir(join(testDir, ".fusion"), { recursive: true });
      if (existsSync(memoryPath)) await unlink(memoryPath);

      // Create with file backend - should work reliably
      const created = await ensureMemoryFileWithBackend(testDir, { memoryBackendType: "file" });
      expect(created).toBe(true);
      
      // File should exist and have default scaffold content
      const content = readFileSync(memoryPath, "utf-8");
      expect(content).toBe(getDefaultMemoryScaffold());
    });
  });
});
