import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { EvidenceKind } from "@complyloop/analysis-core/contract/entities";
import {
  FINDING_STATUSES,
  REMEDIATION_STATUSES,
  type RemediationStatus,
  REQUIREMENT_STATUS_DISPLAY_ORDER,
  REQUIREMENT_STATUSES,
  type RequirementStatus,
  type Severity,
} from "@complyloop/analysis-core/contract/statuses";

import {
  confidenceDisplay,
  determinationDisplay,
  engineDisplay,
  EVIDENCE_TONE_BADGE,
  EVIDENCE_TONE_DOT,
  evidenceDisplay,
  findingStatusDisplay,
  provenanceDisplay,
  remediationStatusDisplay,
  type ReportColorPair,
  requirementStatusDisplay,
  roleTone,
  severityDisplay,
  STATUS_TONE_BADGE,
  STATUS_TONE_REPORT,
} from "./display";
import { severityRank } from "./finding-priority";

const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

describe("requirementStatusDisplay", () => {
  it("labels every requirement status", () => {
    expect(
      REQUIREMENT_STATUSES.map((status) => [
        status,
        requirementStatusDisplay(status).label,
      ]),
    ).toEqual([
      ["passed", "Passed"],
      ["failed", "Failed"],
      ["needs_review", "Needs review"],
      ["not_applicable", "Not applicable"],
      ["unable_to_verify", "Unable to verify"],
    ]);
  });

  it("describes every requirement status", () => {
    for (const status of REQUIREMENT_STATUSES) {
      expect(
        requirementStatusDisplay(status).description.length,
      ).toBeGreaterThan(10);
    }
  });

  it("maps every requirement status tone", () => {
    expect(
      REQUIREMENT_STATUS_DISPLAY_ORDER.map(
        (status) => requirementStatusDisplay(status).tone,
      ),
    ).toEqual(["failed", "review", "passed", "na", "unverifiable"]);
  });

  it("throws on an unhandled status", () => {
    expect(() =>
      requirementStatusDisplay("bogus" as RequirementStatus),
    ).toThrow(/Unhandled requirement status/);
  });
});

describe("remediationStatusDisplay", () => {
  it("labels every remediation status", () => {
    expect(
      REMEDIATION_STATUSES.map((status) => [
        status,
        remediationStatusDisplay(status).label,
      ]),
    ).toEqual([
      ["detected", "Detected"],
      ["suggested", "Suggested"],
      ["approved", "Approved"],
      ["implemented", "Implemented"],
      ["verified", "Verified"],
    ]);
  });

  it("describes every remediation status with a tone-token badge", () => {
    for (const status of REMEDIATION_STATUSES) {
      const display = remediationStatusDisplay(status);
      expect(display.description.length).toBeGreaterThan(10);
      if (display.tone) {
        expect(display.tone).toMatch(
          /^(passed|failed|review|na|unverifiable|signal)$/,
        );
      }
    }
  });

  it("marks detected as needs-triage instead of inert neutral", () => {
    expect(remediationStatusDisplay("detected").tone).toBe("signal");
    expect(remediationStatusDisplay("detected").badgeVariant).toBe("outline");
  });

  it("throws on an unhandled status", () => {
    expect(() =>
      remediationStatusDisplay("bogus" as RemediationStatus),
    ).toThrow(/Unhandled remediation status/);
  });
});

describe("evidenceDisplay", () => {
  it("uses engineer-facing copy instead of snake_case ids", () => {
    expect(evidenceDisplay("assessment_completed").label).toBe(
      "Assessment completed",
    );
    expect(evidenceDisplay("requirements_imported").label).toBe(
      "Scope updated",
    );
    expect(evidenceDisplay("finding", { event: "detected" }).label).toBe(
      "Finding detected",
    );
  });

  it("provides a human label for every evidence kind", () => {
    const kinds: EvidenceKind[] = [
      "project_connected",
      "project_disconnected",
      "project_reset",
      "assessment_completed",
      "assessment_job",
      "finding",
      "remediation_approved",
      "remediation_implemented",
      "remediation_verified",
      "remediation_manually_verified",
      "ai_remediation_suggested",
      "ai_patch_ready",
      "requirement_status_changed",
      "requirement_exception_set",
      "requirement_exception_cleared",
      "requirement_human_passed",
      "requirement_human_pass_cleared",
      "requirements_imported",
      "pull_request_prepared",
      "monitoring_changes_detected",
      "webhook_reassessment",
    ];
    for (const kind of kinds) {
      expect(evidenceDisplay(kind).label.length).toBeGreaterThan(0);
      expect(evidenceDisplay(kind).label).not.toContain("_");
    }
  });

  it("maps finding events and assessment job phases to tones", () => {
    expect(evidenceDisplay("finding", { event: "detected" }).tone).toBe("fail");
    expect(evidenceDisplay("finding", { event: "resolved" }).tone).toBe("pass");
    expect(evidenceDisplay("finding", { event: "dismissed" }).tone).toBe(
      "review",
    );
    expect(evidenceDisplay("assessment_job", { phase: "completed" }).tone).toBe(
      "pass",
    );
    expect(evidenceDisplay("assessment_job", { phase: "failed" }).tone).toBe(
      "fail",
    );
    expect(evidenceDisplay("assessment_job", { phase: "queued" }).tone).toBe(
      "signal",
    );
  });

  it("covers every evidence tone with a dot and badge class", () => {
    const kinds: EvidenceKind[] = [
      "project_connected",
      "assessment_completed",
      "assessment_job",
      "finding",
      "remediation_verified",
      "webhook_reassessment",
    ];
    const tones = new Set(
      kinds.flatMap((kind) => [
        evidenceDisplay(kind).tone,
        evidenceDisplay("finding", { event: "resolved" }).tone,
      ]),
    );
    for (const tone of tones) {
      expect(EVIDENCE_TONE_DOT[tone]).toBeDefined();
      expect(EVIDENCE_TONE_BADGE[tone]).toBeDefined();
    }
  });

  it("throws on an unhandled kind", () => {
    expect(() => evidenceDisplay("bogus" as EvidenceKind)).toThrow(
      /Unhandled evidence kind/,
    );
  });
});

describe("findingStatusDisplay", () => {
  it("labels every finding status", () => {
    expect(
      FINDING_STATUSES.map((status) => [
        status,
        findingStatusDisplay(status).label,
      ]),
    ).toEqual([
      ["open", "Open"],
      ["resolved", "Resolved"],
      ["dismissed", "Dismissed"],
    ]);
  });
});

describe("determinationDisplay", () => {
  it("labels and describes both determination methods", () => {
    expect(determinationDisplay("automated").label).toBe("Automated");
    expect(determinationDisplay("human_review").label).toBe("Human review");
    expect(determinationDisplay("automated").description).toContain(
      "deterministic",
    );
    expect(determinationDisplay("human_review").description).toContain(
      "reviewer",
    );
    expect(determinationDisplay("automated").tone).toBe("signal");
    expect(determinationDisplay("human_review").tone).toBe("signal");
  });
});

describe("severityDisplay", () => {
  it("labels every severity", () => {
    expect(
      SEVERITIES.map((severity) => severityDisplay(severity).label),
    ).toEqual(["Critical", "Serious", "Moderate", "Minor"]);
  });

  it("describes every severity", () => {
    for (const severity of SEVERITIES) {
      expect(severityDisplay(severity).description.length).toBeGreaterThan(10);
    }
  });

  it("gives every severity a distinct tone+variant treatment", () => {
    // Triage scanning must not rely on color alone — critical/serious share
    // the failed hue but differ by fill vs outline, and detected reads as
    // needs-triage instead of inert neutral.
    const treatments = SEVERITIES.map((severity) => {
      const display = severityDisplay(severity);
      return `${display.tone ?? "none"}:${display.badgeVariant ?? "filled"}`;
    });
    expect(new Set(treatments).size).toBe(SEVERITIES.length);
    expect(severityDisplay("serious").tone).toBe("failed");
    expect(severityDisplay("moderate").tone).toBe("review");
  });

  it("pairs every badge tone fill with its matching text token", () => {
    // Regression gate: badge text must stay readable against its own fill.
    // Light-mode tokens backing these classes are verified at ≥4.5:1 against
    // white (see globals.css); this test keeps fill and text from drifting
    // apart when tones are edited.
    const toneToken: Record<string, string> = {
      passed: "status-passed",
      failed: "status-failed",
      review: "status-review",
      na: "status-na",
      unverifiable: "status-unverifiable",
      signal: "signal",
    };
    for (const [tone, token] of Object.entries(toneToken)) {
      const classes = STATUS_TONE_BADGE[tone as keyof typeof STATUS_TONE_BADGE];
      expect(classes).toContain(`bg-${token}/`);
      expect(classes).toContain(`text-${token}`);
    }
  });

  it("throws on an unhandled severity", () => {
    expect(() => severityDisplay("bogus" as Severity)).toThrow(
      /Unhandled severity/,
    );
  });
});

describe("severityRank", () => {
  it("ranks severities with critical first", () => {
    expect(SEVERITIES.map(severityRank)).toEqual([0, 1, 2, 3]);
  });

  it("throws on an unhandled severity", () => {
    expect(() => severityRank("bogus" as Severity)).toThrow(
      /Unhandled severity/,
    );
  });
});

describe("confidenceDisplay", () => {
  it("describes every confidence level", () => {
    for (const confidence of ["high", "medium", "low"] as const) {
      expect(confidenceDisplay(confidence).description.length).toBeGreaterThan(
        10,
      );
    }
  });

  it("throws on an unrecognized confidence", () => {
    expect(() => confidenceDisplay("certain" as never)).toThrow(
      /Unhandled confidence/,
    );
  });
});

describe("provenanceDisplay", () => {
  it("describes both provenance values with labels", () => {
    expect(provenanceDisplay("deterministic").label).toBe("Deterministic");
    expect(provenanceDisplay("ai").label).toBe("AI-generated");
    expect(provenanceDisplay("deterministic").description).toContain(
      "Rule-based",
    );
    expect(provenanceDisplay("ai").description).toContain("never sets");
  });
});

describe("engineDisplay", () => {
  it("describes both assessment engines with labels", () => {
    expect(engineDisplay("ast").label).toBe("Code");
    expect(engineDisplay("runtime").label).toBe("Live page");
    expect(engineDisplay("ast").description).toContain("your code");
    expect(engineDisplay("runtime").description).toContain("live page");
  });
});

describe("roleTone", () => {
  it("maps every org role", () => {
    expect(roleTone("owner")).toBe("signal");
    expect(roleTone("admin")).toBe("review");
    expect(roleTone("member")).toBe("passed");
    expect(roleTone("viewer")).toBe("na");
  });
});

/**
 * Contrast gate for the light-mode status tokens.
 *
 * `STATUS_TONE_BADGE` renders token-colored text on a 25% token tint, so this
 * test parses the `:root` oklch values out of `globals.css` and asserts the
 * text-on-tint pair hits WCAG AA 4.5:1 — and that large stat numerals on the
 * faint QuickStatTile washes (~7%) hit 3:1. If you retune a token, run this
 * test: it fails before your users squint.
 */

const TOKEN_NAMES = [
  "signal",
  "status-passed",
  "status-failed",
  "status-review",
  "status-na",
  "status-unverifiable",
] as const;

function readRootBlock(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "..", "app", "globals.css"), "utf8");
  const root = css.match(/:root\s*{([^}]*)}/);
  if (!root) throw new Error("globals.css has no :root block");
  return root[1];
}

function parseOklch(block: string, name: string): [number, number, number] {
  const match = block.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`token --${name} not found in :root`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function oklchToSrgb([L, C, H]: [number, number, number]): [
  number,
  number,
  number,
] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  const r = 4.0767416621 * l3 - 3.3077115904 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const gamma = (x: number) => {
    const v = Math.max(0, x);
    return v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;
  };
  return [gamma(r), gamma(g), gamma(bl)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function mix(
  fg: [number, number, number],
  bg: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    fg[0] * t + bg[0] * (1 - t),
    fg[1] * t + bg[1] * (1 - t),
    fg[2] * t + bg[2] * (1 - t),
  ];
}

function contrast(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("light-mode status token contrast", () => {
  const block = readRootBlock();
  const card = oklchToSrgb(parseOklch(block, "card"));

  for (const name of TOKEN_NAMES) {
    it(`--${name} badge text on its 25% tint hits 4.5:1`, () => {
      const token = oklchToSrgb(parseOklch(block, name));
      const tint = mix(token, card, 0.25);
      expect(contrast(token, tint)).toBeGreaterThanOrEqual(4.5);
    });

    it(`--${name} large numerals on a 7% wash hit 3:1`, () => {
      const token = oklchToSrgb(parseOklch(block, name));
      const wash = mix(token, card, 0.07);
      expect(contrast(token, wash)).toBeGreaterThanOrEqual(3);
    });
  }
});

/**
 * Contrast gate for the standalone report palette (moved here from the former
 * `report-colors.test.ts` when that second color table was unified into the
 * tone table above). Every pair must hold WCAG AA 4.5:1 so exports never
 * diverge from the app badges.
 */

function hexLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function hexContrast(a: string, b: string): number {
  const la = hexLuminance(a);
  const lb = hexLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("report palette contrast", () => {
  const entries: Array<[string, ReportColorPair]> = [
    ...Object.entries(STATUS_TONE_REPORT),
    ...SEVERITIES.map(
      (severity) =>
        [severity, severityDisplay(severity).report] as [
          string,
          ReportColorPair,
        ],
    ),
  ];

  for (const [name, pair] of entries) {
    it(`${name} fg-on-bg hits 4.5:1`, () => {
      expect(hexContrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
