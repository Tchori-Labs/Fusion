import { describe, expect, it, vi } from "vitest";
import { __testOnlyPromptCompaction, promptWithFallback } from "../pi.js";

const OVERFLOW_ERROR = "This model's maximum context length is 32768 tokens. However, your messages resulted in 45870 tokens.";

function makeSession(promptImpl: (input: string) => Promise<void>) {
  return {
    prompt: vi.fn(promptImpl),
    compact: vi.fn(async () => null),
  } as any;
}

describe("compactLargePromptSections", () => {
  it("returns null for prompts without recognized headings", () => {
    const prompt = "## Task\n\nhello";
    expect(__testOnlyPromptCompaction.compactLargePromptSections(prompt)).toBeNull();
  });

  it("returns null when sections are below budget", () => {
    const prompt = "## User Comments\n\n- **[2026-05-09]** short";
    expect(__testOnlyPromptCompaction.compactLargePromptSections(prompt)).toBeNull();
  });

  it("shortens oversized Subtask Consideration but keeps other sections", () => {
    const big = "a".repeat(3000);
    const prompt = `## Subtask Consideration\n\n${big}\n\n## Task\n\nkeep me`;
    const out = __testOnlyPromptCompaction.compactLargePromptSections(prompt);
    expect(out).toContain("## Task\n\nkeep me");
    expect(out).toContain("Section trimmed");
    expect(out?.length).toBeLessThan(prompt.length);
  });

  it("shortens attachment fenced bodies but preserves image bullets", () => {
    const big = "b".repeat(5000);
    const prompt = `## Attachments\n\n- **image.png** (image/png) — included as image below\n### file.txt (text/plain)\n\n\
\`\`\`\n${big}\n\`\`\``;
    const out = __testOnlyPromptCompaction.compactLargePromptSections(prompt);
    expect(out).toContain("- **image.png** (image/png) — included as image below");
    expect(out).toContain("attachment body trimmed");
  });

  it("shortens Existing Specification while keeping structure", () => {
    const big = "c".repeat(8000);
    const prompt = `## Existing Specification\n\n\`\`\`markdown\n${big}\n\`\`\``;
    const out = __testOnlyPromptCompaction.compactLargePromptSections(prompt);
    expect(out).toContain("## Existing Specification");
    expect(out).toContain("existing specification middle trimmed");
  });

  it("collapses older User Comments while keeping latest", () => {
    const comments = Array.from({ length: 40 }, (_, i) => `- **[2026-05-${String(i + 1).padStart(2, "0")}]** ${"x".repeat(120)}`).join("\n");
    const prompt = `## User Comments\n\n${comments}`;
    const out = __testOnlyPromptCompaction.compactLargePromptSections(prompt);
    expect(out).toContain("earlier comments trimmed");
    expect(out).toContain("2026-05-40");
  });
});

describe("promptWithFallback section compaction", () => {
  it("recovers via section compaction on context overflow", async () => {
    const big = "z".repeat(5000);
    const prompt = `## Existing Specification\n\n${big}`;
    let first = true;
    const session = makeSession(async () => {
      if (first) {
        first = false;
        throw new Error(OVERFLOW_ERROR);
      }
    });

    await expect(promptWithFallback(session, prompt)).resolves.toBeUndefined();
    expect(session.prompt).toHaveBeenCalledTimes(2);
    expect(session.prompt.mock.calls[1][0].length).toBeLessThan(prompt.length);
  });

  it("throws original overflow error when no strategy recovers", async () => {
    const prompt = "## Task\n\nsmall";
    const session = makeSession(async () => {
      throw new Error(OVERFLOW_ERROR);
    });
    session.compact = vi.fn(async () => null);

    await expect(promptWithFallback(session, prompt)).rejects.toThrow(OVERFLOW_ERROR);
  });
});
