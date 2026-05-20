import { describe, expect, it } from "vitest";
import { detectExternalIntegrationEvidenceGaps } from "../spec-validation/external-integration-evidence.js";

describe("detectExternalIntegrationEvidenceGaps", () => {
  it("returns empty findings when prompt has no external integration signals", () => {
    const prompt = `# Task\n## Mission\nRefactor retry budget counters in scheduler.\n## Steps\n- Update store logic.`;
    expect(detectExternalIntegrationEvidenceGaps({ promptContent: prompt })).toEqual([]);
  });

  it("flags FN-5320 style hallucination signals", () => {
    const fabricatedRepo = ["worktrunk", "worktrunk"].join("/");
    const prompt = `## Mission\nAdd external integration for worktrunk install flow.\n\n## Steps\n- Install and probe \`worktrunk\` binary.\n- Download from https://github.com/${fabricatedRepo}/releases/latest/download/worktrunk.tar.gz`;

    const findings = detectExternalIntegrationEvidenceGaps({ promptContent: prompt });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.missing).toEqual(
      expect.arrayContaining(["canonical-upstream-repo-url", "checksum-or-source-of-truth-evidence"]),
    );
  });

  it("accepts a canonical worktrunk evidence set", () => {
    const prompt = `## Mission\nHarden external binary integration.\n\n## Context to Read First\n- https://github.com/max-sixty/worktrunk\n- https://worktrunk.dev/\n- WORKTRUNK_PINNED_RELEASE\n\n## Steps\n- Probe and run \`wt\` from PATH.\n- Reference releases at https://github.com/max-sixty/worktrunk/releases/latest/download/wt-linux-x64.tar.gz\n- Keep source as upstream-pending-verification until checksums are pinned.`;

    expect(detectExternalIntegrationEvidenceGaps({ promptContent: prompt })).toEqual([]);
  });

  it("treats duplicate-segment github URLs as missing canonical evidence", () => {
    const duplicateRepo = ["foo", "foo"].join("/");
    const prompt = `## Mission\nExternal tool install.\n## Steps\n- download release from https://github.com/${duplicateRepo}/releases/latest/download/foo.tgz\n- run and probe \`foo\``;

    const findings = detectExternalIntegrationEvidenceGaps({ promptContent: prompt });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.missing).toContain("canonical-upstream-repo-url");
  });
});
