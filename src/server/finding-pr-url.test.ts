import { describe, expect, it } from "vitest";
import { pullRequestUrlFromEvidence } from "./finding-pr-url";

describe("pullRequestUrlFromEvidence", () => {
  it("returns the latest pull request URL from evidence", () => {
    expect(
      pullRequestUrlFromEvidence([
        {
          kind: "pull_request_prepared",
          detail: { prUrl: "https://github.com/o/r/pull/1" },
        },
        {
          kind: "pull_request_prepared",
          detail: { prUrl: "https://github.com/o/r/pull/2" },
        },
      ]),
    ).toBe("https://github.com/o/r/pull/2");
  });

  it("returns null when no PR evidence exists", () => {
    expect(pullRequestUrlFromEvidence([])).toBeNull();
  });
});
