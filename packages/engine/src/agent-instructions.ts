import { readFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import type { Agent } from "@fusion/core";

/**
 * Resolve custom instructions for an agent by combining inline text and/or
 * file-based instructions.
 *
 * @param agent - The agent record (may contain instructionsText and instructionsPath)
 * @param rootDir - Project root directory for resolving relative paths
 * @returns Concatenated instructions string, or empty string if none
 */
export async function resolveAgentInstructions(
  agent: Agent | null | undefined,
  rootDir: string,
): Promise<string> {
  if (!agent) return "";

  const parts: string[] = [];

  // Inline instructions take first position
  if (agent.instructionsText?.trim()) {
    parts.push(agent.instructionsText.trim());
  }

  // File-based instructions appended after inline text
  if (agent.instructionsPath?.trim()) {
    const filePath = isAbsolute(agent.instructionsPath)
      ? agent.instructionsPath
      : join(rootDir, agent.instructionsPath);

    try {
      const content = await readFile(filePath, "utf-8");
      if (content.trim()) {
        parts.push(content.trim());
      }
    } catch (err: unknown) {
      // Graceful fallback: file doesn't exist or is unreadable
      // Log a warning but don't throw — instructionsText is still used
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.warn(
          `[agent-instructions] Instructions file not found for agent ${agent.id}: ${filePath}`,
        );
      } else {
        console.warn(
          `[agent-instructions] Failed to read instructions file for agent ${agent.id}: ${filePath} (${code})`,
        );
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Append a custom instructions block to a base system prompt.
 * If instructions are empty, returns the base prompt unchanged.
 *
 * @param basePrompt - The original system prompt
 * @param instructions - Resolved instructions string
 * @returns System prompt with instructions appended (if any)
 */
export function buildSystemPromptWithInstructions(
  basePrompt: string,
  instructions: string,
): string {
  if (!instructions.trim()) return basePrompt;
  return `${basePrompt}\n\n## Custom Instructions\n\n${instructions}`;
}
