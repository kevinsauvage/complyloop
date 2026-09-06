import { describe, expect, it } from "vitest";
import type { Finding, Remediation } from "@complyloop/db/types";
import {
  canBulkApproveRemediation,
  findingAct,
  hasSafeDeterministicFix,
  type FindingActInput,
} from "./finding-act";

const sourceFinding: Finding = {
  id: "f1",
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "img-alt",
  status: "open",
  kind: "violation",
  severity: "serious",
  reason: "missing alt",
  confidence: "high",
  location: {
    kind: "source",
    filePath: "a.tsx",
    line: 1,
    column: 1,
    span: { start: 0, end: 1 },
    snippet: "<img />",
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const domFinding: Finding = {
  ...sourceFinding,
  location: {
    kind: "dom",
    url: "https://example.com/login",
    selector: "input#email",
    snippet: "<input id='email'>",
  },
};

function rem(
  status: Remediation["status"],
  suggestion: Remediation["suggestion"] = null,
): Remediation {
  return { id: "r1", findingId: "f1", status, suggestion, history: [] };
}

function act(overrides: Partial<FindingActInput> = {}) {
  return findingAct({
    finding: sourceFinding,
    remediation: rem("detected"),
    canRemediate: true,
    prUrl: null,
    aiAvailable: true,
    patchReady: false,
    githubConnected: true,
    ...overrides,
  });
}

describe("hasSafeDeterministicFix", () => {
  it("is true for a non-editable proposed fix", () => {
    expect(
      hasSafeDeterministicFix({
        ...sourceFinding,
        fix: {
          kind: "remove_attribute",
          attribute: "role",
          span: { start: 0, end: 1 },
        },
      }),
    ).toBe(true);
  });

  it("is false when a human must edit the inserted value", () => {
    expect(
      hasSafeDeterministicFix({
        ...sourceFinding,
        fix: {
          kind: "insert_attribute",
          attribute: "alt",
          value: "",
          editable: true,
          span: { start: 0, end: 1 },
        },
      }),
    ).toBe(false);
  });

  it("is false when there is no proposed fix", () => {
    expect(hasSafeDeterministicFix(sourceFinding)).toBe(false);
  });
});

describe("findingAct", () => {
  it("offers Generate patch for an open source Finding with no patch", () => {
    const view = act();
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.title).toBe("Fix this Finding");
    expect(view.generateLabel).toBe("Generate patch");
    expect(view.canGenerate).toBe(true);
    expect(view.showDismiss).toBe(true);
  });

  it("labels deterministic source generation as Verify and prepare patch", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        fix: {
          kind: "remove_attribute",
          attribute: "role",
          span: { start: 0, end: 1 },
        },
      },
      aiAvailable: false,
    });
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.generateLabel).toBe("Verify and prepare patch");
    expect(view.canGenerate).toBe(true);
  });

  it("shows the patch and Create draft PR when a verified patch is ready", () => {
    const view = act({
      patchReady: true,
      remediation: rem("suggested", {
        description: "Add alt",
        proposedSnippet: '<img alt="Hero" />',
        provenance: "ai",
      }),
    });
    expect(view.beat).toBe("source_review");
    if (view.beat !== "source_review") return;
    expect(view.title).toBe("Review patch");
    expect(view.showCreatePr).toBe(true);
    expect(view.showReplacePatch).toBe(true);
    expect(view.showHandoff).toBe(true);
  });

  it("treats an open source Finding with a PR as in review on GitHub", () => {
    const view = act({
      patchReady: true,
      prUrl: "https://github.com/acme/shop/pull/65",
      remediation: rem("approved"),
    });
    expect(view.beat).toBe("source_in_review");
    if (view.beat !== "source_in_review") return;
    expect(view.title).toBe("In review on GitHub");
    expect(view.prUrl).toBe("https://github.com/acme/shop/pull/65");
    expect(view.showHandoff).toBe(false);
    expect(view.showDismiss).toBe(true);
  });

  it("does not offer generate or handoff once the Finding is verified", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        status: "resolved",
        resolvedNote: "Fix verified by re-running the automated check.",
      },
      remediation: rem("verified"),
      prUrl: "https://github.com/acme/shop/pull/65",
      patchReady: true,
    });
    expect(view.beat).toBe("verified");
    expect(view.showDismiss).toBe(false);
    expect(view.showHandoff).toBe(false);
  });

  it("does not offer generate or dismiss for a dismissed Finding", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        status: "dismissed",
        dismissal: {
          reason: "false_positive",
          note: "decorative",
          at: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    expect(view.beat).toBe("dismissed");
    expect(view.showDismiss).toBe(false);
  });

  it("offers Approve for a runtime Finding with a suggestion", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("suggested", {
        description: "Associate a label",
        proposedSnippet: "<label>Email</label>",
        provenance: "ai",
      }),
    });
    expect(view.beat).toBe("runtime_approve");
    expect(view.title).toBe("Review guidance");
    expect(view.showHandoff).toBe(true);
  });

  it("offers Verify for an implemented site-level Finding", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        location: {
          kind: "site",
          pages: ["/", "/about"],
          detail: "Nav labels differ",
        },
      },
      remediation: rem("implemented"),
    });
    expect(view.beat).toBe("runtime_verify");
  });

  it("offers Verify for an implemented runtime Finding", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("implemented"),
    });
    expect(view.beat).toBe("runtime_verify");
    expect(view.title).toBe("Confirm the page is fixed");
  });

  it("offers Implement for an approved runtime Finding", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("approved"),
    });
    expect(view.beat).toBe("runtime_implement");
    expect(view.title).toBe("Implemented outside ComplyLoop");
  });

  it("shows Verified beat for a verified runtime Finding", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("verified"),
    });
    expect(view.beat).toBe("verified");
    expect(view.title).toBe("Verified");
  });

  it("shows view_only for users who cannot remediate", () => {
    const view = act({ canRemediate: false });
    expect(view.beat).toBe("view_only");
    expect(view.title).toBe("Fix this Finding");
    expect(view.description).toMatch(/view-only access/);
  });

  it("explains that GitHub must be connected before generating a patch", () => {
    const view = act({
      githubConnected: false,
      aiAvailable: true,
      canRemediate: true,
    });
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.description).toMatch(/Connect a GitHub repository/);
  });

  it("explains that AI_GATEWAY_API_KEY disables generation", () => {
    const view = act({
      aiAvailable: false,
      githubConnected: true,
    });
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.description).toMatch(/AI_GATEWAY_API_KEY/);
  });

  it("never treats a runtime Finding as a patch/PR beat", () => {
    const view = act({
      finding: domFinding,
      patchReady: true,
      prUrl: "https://github.com/acme/shop/pull/1",
      githubConnected: true,
    });
    expect(view.beat).toBe("runtime_generate");
  });

  it("throws on an unrecognized remediation status", () => {
    expect(() =>
      act({ finding: domFinding, remediation: rem("bogus" as never) }),
    ).toThrow(/Unhandled remediation status/);
  });
});

describe("canBulkApproveRemediation", () => {
  it("allows bulk approve for open runtime findings with a suggestion", () => {
    expect(
      canBulkApproveRemediation(domFinding, "suggested"),
    ).toBe(true);
  });

  it("does not bulk approve source findings even when suggested", () => {
    expect(
      canBulkApproveRemediation(sourceFinding, "suggested"),
    ).toBe(false);
  });

  it("does not bulk approve resolved or non-suggested runtime findings", () => {
    expect(
      canBulkApproveRemediation(
        { ...domFinding, status: "resolved" },
        "suggested",
      ),
    ).toBe(false);
    expect(canBulkApproveRemediation(domFinding, "approved")).toBe(false);
  });
});
