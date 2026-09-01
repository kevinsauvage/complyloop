import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "@/core/finding-types";
import { FindingUnderstandCard } from "./finding-understand-card";

vi.mock("@/server/actions/remediation-ai", () => ({
  generateAiExplanationAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const useActionStateMock = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (...args: unknown[]) => useActionStateMock(...args),
  };
});

afterEach(() => {
  cleanup();
});

const finding: Finding = {
  id: "f1",
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "redundant-role",
  status: "open",
  kind: "violation",
  severity: "moderate",
  reason: "redundant role",
  confidence: "high",
  location: {
    kind: "source",
    filePath: "Header.tsx",
    line: 13,
    column: 1,
    span: { start: 0, end: 1 },
    snippet: '<header role="banner">',
  },
  fix: null,
  explanations: [
    {
      whyItFailed: '<header> already has an implicit banner role.',
      impact: "Redundant roles can confuse assistive technologies.",
      howToFix: "Remove the redundant role.",
      provenance: "deterministic",
      confidence: "high",
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

describe("FindingUnderstandCard", () => {
  it("shows why it failed next to the source location and snippet", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingUnderstandCard
        finding={finding}
        canRemediate
        aiAvailable
      />,
    );

    expect(
      screen.getByText("<header> already has an implicit banner role."),
    ).toBeInTheDocument();
    expect(screen.getByText("Header.tsx:13")).toBeInTheDocument();
    expect(screen.getByText('<header role="banner">')).toBeInTheDocument();
    expect(
      screen.getByText("Impact and how to fix"),
    ).toBeInTheDocument();
  });

  it("keeps AI explanation behind a disclosure", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingUnderstandCard
        finding={finding}
        canRemediate
        aiAvailable
      />,
    );

    expect(screen.getByText("AI explanation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate AI explanation" }),
    ).toBeInTheDocument();
  });
});
