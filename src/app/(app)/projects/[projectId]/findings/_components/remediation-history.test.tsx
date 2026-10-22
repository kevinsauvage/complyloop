import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  EvidenceRecord,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";

import { TooltipProvider } from "@/components/ui/tooltip";

import { RemediationHistory } from "./remediation-history";

afterEach(() => {
  cleanup();
});

function evidenceRow(
  partial: Pick<EvidenceRecord, "kind" | "at" | "summary"> &
    Partial<EvidenceRecord>,
): EvidenceRecord {
  return {
    id: `e-${partial.kind}-${partial.at}`,
    projectId: "p1",
    controlId: "c1",
    findingId: "f1",
    ...partial,
  };
}

function renderHistory(remediation: Remediation, evidence: EvidenceRecord[]) {
  return render(
    <TooltipProvider>
      <RemediationHistory remediation={remediation} evidence={evidence} />
    </TooltipProvider>,
  );
}

const remediation: Remediation = {
  id: "r1",
  findingId: "f1",
  status: "implemented",
  suggestion: null,
  history: [],
};

// Newest-first, as `listEvidenceForFinding` returns.
const evidence: EvidenceRecord[] = [
  evidenceRow({
    kind: "remediation_implemented",
    at: "2026-01-04T09:00:00.000Z",
    summary: "Remediation implemented",
    detail: { note: "Fixed in PR #42" },
  }),
  evidenceRow({
    kind: "remediation_approved",
    at: "2026-01-03T09:00:00.000Z",
    summary: "Remediation approved",
    detail: { note: "Approved by the accessibility lead." },
  }),
  evidenceRow({
    kind: "ai_remediation_suggested",
    at: "2026-01-02T09:00:00.000Z",
    summary: "AI remediation suggested",
    detail: { description: "Add an alt attribute" },
  }),
  evidenceRow({
    kind: "finding",
    at: "2026-01-01T09:00:00.000Z",
    summary: "Finding detected",
    detail: { event: "detected" },
  }),
];

describe("RemediationHistory", () => {
  it("renders the evidence timeline in reverse chronological order", () => {
    renderHistory(remediation, evidence);

    expect(
      screen.getByRole("heading", { name: "Remediation history" }),
    ).toBeInTheDocument();

    const timeline = screen.getByRole("list", {
      name: "Remediation history timeline",
    });
    expect(timeline).toBeInTheDocument();

    const text = timeline.textContent ?? "";
    // Newest entry rendered first (implemented → approved → suggested).
    // The `finding` row is not part of the remediation timeline.
    expect(text.indexOf("Implemented")).toBeLessThan(text.indexOf("Approved"));
    expect(text.indexOf("Approved")).toBeLessThan(text.indexOf("Suggested"));
    expect(text).not.toContain("Finding detected");
  });

  it("shows the note attached to an entry", () => {
    renderHistory(remediation, evidence);
    expect(screen.getByText("Fixed in PR #42")).toBeInTheDocument();
    expect(
      screen.getByText("Approved by the accessibility lead."),
    ).toBeInTheDocument();
    expect(screen.getByText("Add an alt attribute")).toBeInTheDocument();
  });

  it("shows the current status when no history has been recorded", () => {
    renderHistory({ ...remediation, status: "verified" }, []);
    expect(
      screen.getByText(/No remediation steps recorded yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current status:/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified/i)).toBeInTheDocument();
  });

  it("renders verification failures under the current status", () => {
    renderHistory(remediation, [
      evidenceRow({
        kind: "remediation_verification_failed",
        at: "2026-01-05T09:00:00.000Z",
        summary: "Verification failed",
        detail: { note: "Still detected on the page." },
      }),
    ]);
    expect(screen.getByText("Still detected on the page.")).toBeInTheDocument();
  });
});
