import { describe, expect, it } from "vitest";

import {
  dedupeRuntimeFindings,
  filterAstFindingsForAuthority,
  type RuntimeFileCoverage,
} from "./merge-findings";
import type { RawFinding } from "./types";

/** Every page was rendered — the repo-wide drop is safe. */
const FULL_COVERAGE: RuntimeFileCoverage = {
  fullyCovered: true,
  coveredFiles: new Set(),
};

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
    analyzerId: "ast",
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
    expect(
      filterAstFindingsForAuthority([astInput, astImg], false, FULL_COVERAGE),
    ).toHaveLength(2);
  });

  it("drops composition-sensitive AST findings when runtime ran", () => {
    const astLegend: RawFinding = {
      ...astInput,
      checkId: "fieldset-legend",
      reason: "legend",
    };
    const filtered = filterAstFindingsForAuthority(
      [astInput, astLegend],
      true,
      FULL_COVERAGE,
    );
    expect(filtered.map((finding) => finding.checkId)).toEqual([
      "fieldset-legend",
    ]);
  });

  it("drops runtime_only AST findings when runtime ran (dedupe across engines)", () => {
    const astLegend: RawFinding = {
      ...astInput,
      checkId: "fieldset-legend",
      reason: "legend",
    };
    const filtered = filterAstFindingsForAuthority(
      [astLandmark, astDeprecated, astLegend],
      true,
      FULL_COVERAGE,
    );
    expect(filtered.map((finding) => finding.checkId)).toEqual([
      "fieldset-legend",
    ]);
  });

  it("drops source twins axe also owns when runtime ran", () => {
    const twins: RawFinding[] = [
      astImg,
      { ...astInput, checkId: "video-caption", reason: "no captions" },
      { ...astInput, checkId: "meta-viewport", reason: "user-scalable" },
      { ...astInput, checkId: "no-blink-marquee", reason: "blink" },
      { ...astInput, checkId: "list-structure", reason: "div list" },
    ];
    expect(
      filterAstFindingsForAuthority(twins, false, FULL_COVERAGE).map(
        (f) => f.checkId,
      ),
    ).toEqual([
      "img-alt",
      "video-caption",
      "meta-viewport",
      "no-blink-marquee",
      "list-structure",
    ]);
    expect(filterAstFindingsForAuthority(twins, true, FULL_COVERAGE)).toEqual(
      [],
    );
  });

  it("drops AST text-spacing when runtime ran (axe avoid-inline-spacing owns it)", () => {
    const astSpacing: RawFinding = {
      ...astInput,
      checkId: "text-spacing",
      reason: "inline letter-spacing",
    };
    const astLegend: RawFinding = {
      ...astInput,
      checkId: "fieldset-legend",
      reason: "legend",
    };
    expect(
      filterAstFindingsForAuthority(
        [astSpacing, astLegend],
        false,
        FULL_COVERAGE,
      ).map((finding) => finding.checkId),
    ).toEqual(["text-spacing", "fieldset-legend"]);
    expect(
      filterAstFindingsForAuthority(
        [astSpacing, astLegend],
        true,
        FULL_COVERAGE,
      ).map((finding) => finding.checkId),
    ).toEqual(["fieldset-legend"]);
  });

  it("keeps runtime_only AST findings when runtime did not run (CI / browserless)", () => {
    const filtered = filterAstFindingsForAuthority(
      [astLandmark, astDeprecated],
      false,
      FULL_COVERAGE,
    );
    expect(filtered.map((finding) => finding.checkId)).toEqual([
      "landmark-one-main",
      "css-for-presentation",
    ]);
  });

  it("keeps every AST finding when coverage is unknown", () => {
    const astLegend: RawFinding = {
      ...astInput,
      checkId: "fieldset-legend",
      reason: "legend",
    };
    expect(
      filterAstFindingsForAuthority([astInput, astLegend], true, null).map(
        (finding) => finding.checkId,
      ),
    ).toEqual(["input-label", "fieldset-legend"]);
  });

  it("drops only findings on pages the audit actually rendered", () => {
    const sourceAt = (filePath: string): RawFinding => ({
      ...astImg,
      location: {
        kind: "source",
        filePath,
        line: 1,
        column: 1,
        snippet: "<img />",
        span: { start: 0, end: 1 },
      },
    });
    const onHome = sourceAt("app/page.tsx");
    const onCheckout = sourceAt("app/checkout/page.tsx");
    const partial: RuntimeFileCoverage = {
      fullyCovered: false,
      coveredFiles: new Set(["app/page.tsx"]),
    };
    const filtered = filterAstFindingsForAuthority(
      [onHome, onCheckout],
      true,
      partial,
    );
    // Home was rendered (runtime owns it), checkout was not — its AST finding
    // must survive so the requirement cannot derive `passed`.
    expect(
      filtered.map((finding) =>
        finding.location.kind === "source" ? finding.location.filePath : null,
      ),
    ).toEqual(["app/checkout/page.tsx"]);
  });
});

function domFinding(
  checkId: RawFinding["checkId"],
  analyzerId: NonNullable<RawFinding["analyzerId"]>,
  analyzerRuleId: string,
  snippet: string,
  selector = "#x",
): RawFinding {
  return {
    checkId,
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: `${analyzerId} ${analyzerRuleId}`,
    location: {
      kind: "dom",
      url: "https://app.example/",
      selector,
      snippet,
    },
    fix: null,
    analyzerId,
    analyzerRuleId,
  };
}

describe("dedupeRuntimeFindings", () => {
  it("collapses axe and playwright-custom on the same check and node", () => {
    const snippet = "<button>";
    const deduped = dedupeRuntimeFindings([
      domFinding("focus-visible", "axe", "focus-order-semantics", snippet),
      domFinding(
        "focus-visible",
        "playwright-custom",
        "focus-visible",
        snippet,
      ),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.analyzerId).toBe("axe");
    expect(deduped[0]?.contributingAnalyzers).toEqual([
      {
        analyzerId: "playwright-custom",
        analyzerRuleId: "focus-visible",
      },
    ]);
  });

  it("keeps findings when the same check hits different nodes", () => {
    const deduped = dedupeRuntimeFindings([
      domFinding("duplicate-id", "axe", "duplicate-id", '<span id="a"></span>'),
      domFinding("content-region", "axe", "region", '<a href="/help">Help</a>'),
    ]);
    expect(deduped).toHaveLength(2);
  });

  it("does not collapse distinct nodes that share identical markup", () => {
    const deduped = dedupeRuntimeFindings([
      domFinding(
        "button-name",
        "axe",
        "button-name",
        "<button>OK</button>",
        "#btn1",
      ),
      domFinding(
        "button-name",
        "axe",
        "button-name",
        "<button>OK</button>",
        "#btn2",
      ),
    ]);
    expect(deduped).toHaveLength(2);
    expect(
      deduped.map((finding) =>
        finding.location.kind === "dom" ? finding.location.selector : null,
      ),
    ).toEqual(["#btn1", "#btn2"]);
  });

  it("falls back to the snippet when selectors are unknown or missing", () => {
    const deduped = dedupeRuntimeFindings([
      domFinding(
        "button-name",
        "axe",
        "button-name",
        "<button>OK</button>",
        "(unknown)",
      ),
      domFinding(
        "button-name",
        "playwright-custom",
        "button-name",
        "<button>OK</button>",
        "(unknown)",
      ),
    ]);
    expect(deduped).toHaveLength(1);
  });

  it("does not merge site-level findings with dom findings", () => {
    const deduped = dedupeRuntimeFindings([
      domFinding(
        "duplicate-id",
        "axe",
        "duplicate-id",
        '<span id="dup"></span>',
      ),
      {
        checkId: "consistent-nav",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason: "Nav differs",
        location: {
          kind: "site",
          pages: ["https://app.example/a", "https://app.example/b"],
          detail: "Nav signatures differ",
        },
        fix: null,
        analyzerId: "site-level",
      },
    ]);
    expect(deduped).toHaveLength(2);
  });
});
