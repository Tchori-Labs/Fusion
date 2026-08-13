import { describe, expect, it } from "vitest";
import {
  descriptionReferencesSourceUrl,
  isGitHubIssueAlreadyImported,
} from "../github.js";

describe("GitHub import source URL boundaries", () => {
  const issueOne = "https://github.com/OWNER/REPO/issues/1";

  it("does not treat a longer legacy issue URL as an import of its prefix", () => {
    expect(descriptionReferencesSourceUrl(`Source: ${issueOne}5`, issueOne)).toBe(false);
    expect(descriptionReferencesSourceUrl(`Source: ${issueOne}32`, issueOne)).toBe(false);
    expect(descriptionReferencesSourceUrl("Source: https://github.com/OWNER/REPO/issues/60", "https://github.com/OWNER/REPO/issues/6")).toBe(false);
  });

  it("still matches exact legacy URLs regardless of case or one trailing slash", () => {
    expect(descriptionReferencesSourceUrl("Source: https://github.com/owner/repo/issues/1/", issueOne)).toBe(true);
  });

  it("never falls through a nonmatching structured provenance record to description text", () => {
    expect(isGitHubIssueAlreadyImported({
      description: `Source: ${issueOne}`,
      sourceIssue: {
        provider: "github",
        repository: "owner-b/repo-b",
        issueNumber: 1,
        externalIssueId: "1",
        url: "https://github.com/owner-b/repo-b/issues/1",
      },
    }, {
      owner: "owner", repo: "repo", issueNumber: 1, sourceUrl: issueOne,
    })).toBe(false);
  });
});
