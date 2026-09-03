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
  // runtime_only ids: html-validate rendered findings and the AST heuristic
  // warnings (error-prevention, accessible-auth-enhanced) whose verdict the
  // runtime audit owns.
  const astLandmark: RawFinding = {
    ...astInput,
    checkId: "landmark-one-main",
    reason: "multiple main",
  };
  const astDeprecated: RawFinding = {
    ...astInput,
    checkId: "css-for-presentation",
    reason: "deprecated attr",
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

  it("drops runtime_only AST findings when runtime ran (dedupe across engines)", () => {
    const filtered = filterAstFindingsForAuthority(
      [astLandmark, astDeprecated, astImg],
      true,
    );
    // astImg is standard and stays; runtime-only ids are dropped so their
    // verdict comes from the rendered pass and a defect yields one finding.
    expect(filtered.map((finding) => finding.checkId)).toEqual(["img-alt"]);
  });

  it("keeps runtime_only AST findings when runtime did not run (CI / browserless)", () => {
    const filtered = filterAstFindingsForAuthority(
      [astLandmark, astDeprecated],
      false,
    );
    expect(filtered.map((finding) => finding.checkId)).toEqual([
      "landmark-one-main",
      "css-for-presentation",
    ]);
  });
});
