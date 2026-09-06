import { describe, expect, it } from "vitest";
import type { RawFinding } from "../types";
import { dedupeRuntimeFindings } from "./dedupe-runtime-findings";

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
    engine: "runtime",
    analyzerId,
    analyzerRuleId,
  };
}

describe("dedupeRuntimeFindings", () => {
  it("collapses axe and playwright-custom on the same check and node", () => {
    const snippet = "<button>";
    const deduped = dedupeRuntimeFindings([
      domFinding("focus-visible", "axe", "focus-order-semantics", snippet),
      domFinding("focus-visible", "playwright-custom", "focus-visible", snippet),
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
      domFinding(
        "content-region",
        "axe",
        "region",
        '<a href="/help">Help</a>',
      ),
    ]);
    expect(deduped).toHaveLength(2);
  });

  it("does not collapse distinct nodes that share identical markup", () => {
    const deduped = dedupeRuntimeFindings([
      domFinding("button-name", "axe", "button-name", "<button>OK</button>", "#btn1"),
      domFinding("button-name", "axe", "button-name", "<button>OK</button>", "#btn2"),
    ]);
    expect(deduped).toHaveLength(2);
    expect(
      deduped.map(
        (finding) =>
          finding.location.kind === "dom" ? finding.location.selector : null,
      ),
    ).toEqual(["#btn1", "#btn2"]);
  });

  it("falls back to the snippet when selectors are unknown or missing", () => {
    const deduped = dedupeRuntimeFindings([
      domFinding("button-name", "axe", "button-name", "<button>OK</button>", "(unknown)"),
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
      domFinding("duplicate-id", "axe", "duplicate-id", '<span id="dup"></span>'),
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
        engine: "runtime",
        analyzerId: "site-level",
      },
    ]);
    expect(deduped).toHaveLength(2);
  });
});
