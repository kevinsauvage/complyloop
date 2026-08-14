import { describe, expect, it } from "vitest";
import { filterAstFindingsForAuthority } from "@/server/assessment-helpers";
import type { RawFinding } from "../types";
import { checkIdForAxeRule } from "./axe-map";
import {
  findingsFromAxePages,
  joinRuntimeUrl,
  runtimeRoutesFor,
} from "./findings";

describe("axe rule mapping", () => {
  it("maps label and button-name to check ids", () => {
    expect(checkIdForAxeRule("label")).toBe("input-label");
    expect(checkIdForAxeRule("button-name")).toBe("button-name");
    expect(checkIdForAxeRule("color-contrast")).toBe("color-contrast");
    expect(checkIdForAxeRule("aria-roles")).toBe("aria-role");
    expect(checkIdForAxeRule("unknown-rule")).toBeUndefined();
  });
});

describe("findingsFromAxePages", () => {
  it("builds dom locations from axe nodes", () => {
    const findings = findingsFromAxePages([
      {
        url: "https://app.example/login",
        violations: [
          {
            id: "label",
            impact: "critical",
            description: "Form elements must have labels",
            help: "Form elements must have labels",
            nodes: [
              {
                html: '<input type="email">',
                target: ["input[type=email]"],
              },
            ],
          },
        ],
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("input-label");
    expect(findings[0]?.engine).toBe("runtime");
    expect(findings[0]?.location).toEqual({
      kind: "dom",
      url: "https://app.example/login",
      selector: "input[type=email]",
      snippet: '<input type="email">',
    });
    expect(findings[0]?.fix).toBeNull();
  });
});

describe("runtime URL helpers", () => {
  it("defaults routes to / when base URL is set", () => {
    expect(runtimeRoutesFor({ runtimeBaseUrl: "https://x.test" })).toEqual([
      "/",
    ]);
    expect(runtimeRoutesFor({})).toEqual([]);
  });

  it("joins base and route", () => {
    expect(joinRuntimeUrl("https://x.test/", "/login")).toBe(
      "https://x.test/login",
    );
  });
});

describe("AST authority filter", () => {
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
