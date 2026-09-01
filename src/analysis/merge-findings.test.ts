import { describe, expect, it } from "vitest";
import type { RawFinding } from "./types";
import { filterAstFindingsForAuthority } from "./merge-findings";

describe("filterAstFindingsForAuthority", () => {
  const astInput: RawFinding = {
    checkId: "input-label",
    kind: "violation",
    severity: "serious",
    confidence: "medium",
    reason: "unlabeled",
    location: {
      kind: "source",
      filePath: "a.tsx",
      line: 1,
      column: 1,
      snippet: "<input />",
      span: { start: 0, end: 1 },
    },
    fix: null,
    engine: "ast",
  };
  const astImg: RawFinding = {
    ...astInput,
    checkId: "img-alt",
    reason: "no alt",
  };

  it("keeps composition-sensitive AST findings when runtime did not run", () => {
    expect(filterAstFindingsForAuthority([astInput, astImg], false)).toHaveLength(
      2,
    );
  });

  it("drops composition-sensitive AST findings when runtime ran", () => {
    const filtered = filterAstFindingsForAuthority([astInput, astImg], true);
    expect(filtered.map((finding) => finding.checkId)).toEqual(["img-alt"]);
  });
});
