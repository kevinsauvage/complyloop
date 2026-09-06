import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Remediation } from "@complyloop/db/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RemediationHistory } from "./remediation-history";

afterEach(() => {
  cleanup();
});

function renderHistory(remediation: Remediation) {
  return render(
    <TooltipProvider>
      <RemediationHistory remediation={remediation} />
    </TooltipProvider>,
  );
}

function makeRemediation(): Remediation {
  return {
    id: "r1",
    findingId: "f1",
    status: "implemented",
    suggestion: null,
    history: [
      { status: "detected", at: "2026-01-01T09:00:00.000Z" },
      { status: "suggested", at: "2026-01-02T09:00:00.000Z" },
      {
        status: "approved",
        at: "2026-01-03T09:00:00.000Z",
        note: "Approved by the accessibility lead.",
      },
      {
        status: "implemented",
        at: "2026-01-04T09:00:00.000Z",
        note: "Fixed in PR #42",
      },
    ],
  };
}

describe("RemediationHistory", () => {
  it("renders every history entry in reverse chronological order", () => {
    renderHistory(makeRemediation());

    expect(
      screen.getByRole("heading", { name: "Remediation history" }),
    ).toBeInTheDocument();

    const timeline = screen.getByRole("list", {
      name: "Remediation history timeline",
    });
    expect(timeline).toBeInTheDocument();

    const text = timeline.textContent ?? "";
    // Newest entry rendered first (implemented → approved → suggested → detected).
    expect(text.indexOf("Implemented")).toBeLessThan(text.indexOf("Approved"));
    expect(text.indexOf("Approved")).toBeLessThan(text.indexOf("Suggested"));
    expect(text.indexOf("Suggested")).toBeLessThan(text.indexOf("Detected"));
  });

  it("shows the note attached to an entry", () => {
    renderHistory(makeRemediation());
    expect(screen.getByText("Fixed in PR #42")).toBeInTheDocument();
    expect(screen.getByText("Approved by the accessibility lead.")).toBeInTheDocument();
  });

  it("shows the current status when no history has been recorded", () => {
    renderHistory({ ...makeRemediation(), history: [], status: "verified" });

    expect(
      screen.getByText(/No remediation steps recorded yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current status:/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified/i)).toBeInTheDocument();
  });
});