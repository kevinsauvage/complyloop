import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Finding } from "@complyloop/analysis-core/contract/entities";

import { FindingUnderstandCard } from "./finding-understand-card";

vi.mock("@/server/actions/remediation-ai", () => ({
  generateAiExplanationAction: vi.fn(),
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
      whyItFailed: "<header> already has an implicit banner role.",
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
      <FindingUnderstandCard finding={finding} canRemediate aiAvailable />,
    );

    expect(
      screen.getByText("<header> already has an implicit banner role."),
    ).toBeInTheDocument();
    expect(screen.getByText("Header.tsx:13")).toBeInTheDocument();
    expect(screen.getByText('<header role="banner">')).toBeInTheDocument();
    expect(screen.getByText("Why this matters")).toBeInTheDocument();
    expect(screen.getByText("How to fix")).toBeInTheDocument();
  });

  it("shows structured dom location details for runtime findings", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    const runtimeFinding: Finding = {
      ...finding,
      checkId: "focus-not-obscured-enhanced",
      location: {
        kind: "dom",
        url: "https://www.kevin-sauvage.com/a",
        selector: 'a[href="/contact"]',
        snippet: "<a>Contact</a>",
        elementLabel: "link “Get in touch”",
        context:
          "Covered by `header#top.sticky` at the top-left of the focus ring",
      },
    };
    render(
      <FindingUnderstandCard
        finding={runtimeFinding}
        canRemediate
        aiAvailable
      />,
    );

    expect(screen.getByText("Element")).toBeInTheDocument();
    expect(screen.getByText("link “Get in touch”")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Covered by `header#top.sticky` at the top-left of the focus ring",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('a[href="/contact"]')).toBeInTheDocument();
  });

  it("derives a readable headline for axe findings without a stored label", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    const contrastFinding: Finding = {
      ...finding,
      checkId: "color-contrast",
      location: {
        kind: "dom",
        url: "https://www.kevin-sauvage.com/",
        selector: ".space-y-16 > .space-y-8.text-center > h2",
        snippet: "<h2>Build accessible experiences</h2>",
        context:
          "Fix any of the following: Element's background color could not be determined due to a background gradient",
      },
    };
    render(
      <FindingUnderstandCard
        finding={contrastFinding}
        canRemediate
        aiAvailable
      />,
    );

    expect(
      screen.getByText("h2 \u201cBuild accessible experiences\u201d"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy selector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /https:\/\/www.kevin-sauvage.com\// }),
    ).toHaveAttribute("href", "https://www.kevin-sauvage.com/");
  });

  it("links source findings to the exact line on GitHub", () => {
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
        githubFullName="acme/shop"
        defaultBranch="main"
      />,
    );
    expect(
      screen.getByRole("link", { name: /Open exact line on GitHub/ }),
    ).toHaveAttribute(
      "href",
      "https://github.com/acme/shop/blob/main/Header.tsx#L13",
    );
  });

  it("shows no code link for DOM findings — rendered text is often dynamic", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    const iconLink: Finding = {
      ...finding,
      checkId: "color-contrast",
      location: {
        kind: "dom",
        url: "https://www.kevin-sauvage.com/",
        selector: 'a[aria-label="Go to Home section"]',
        snippet:
          '<a aria-label="Go to Home section" class="fixed bottom-6"><svg class="size-5"></svg></a>',
        context:
          "Fix any of the following: Element's background color could not be determined due to a background gradient",
      },
    };
    render(
      <FindingUnderstandCard
        finding={iconLink}
        canRemediate
        aiAvailable
        githubFullName="kevinsauvage/next-portfolio"
      />,
    );

    // Rendered names like `Go to ${label} section` come from template
    // expressions, so a GitHub code search can't find the call site.
    expect(
      screen.queryByRole("link", { name: /GitHub/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy selector" }),
    ).toBeInTheDocument();
  });

  it("keeps AI explanation behind a disclosure", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingUnderstandCard finding={finding} canRemediate aiAvailable />,
    );

    expect(screen.getByText("AI explanation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate AI explanation" }),
    ).toBeInTheDocument();
  });
});
