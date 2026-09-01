import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding, Remediation } from "@/core/finding-types";
import { FindingNextStepPanel } from "./finding-next-step-panel";

vi.mock("@/server/actions/ai-fix", () => ({
  generateAiFixAction: vi.fn(),
}));

vi.mock("@/server/actions/pr", () => ({
  createPullRequestAction: vi.fn(),
}));

vi.mock("@/server/actions/remediation-ai", () => ({
  generateAiRemediationAction: vi.fn(),
}));

vi.mock("@/server/actions/remediation", () => ({
  approveRemediationAction: vi.fn(),
}));

vi.mock("@/server/actions/remediation-verify", () => ({
  verifyRemediationAction: vi.fn(),
  markRemediationImplementedAction: vi.fn(),
  manualVerifyRemediationAction: vi.fn(),
}));

vi.mock("@/server/actions/remediation-dismiss", () => ({
  dismissFindingAction: vi.fn(),
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

const rem: Remediation = {
  id: "r1",
  findingId: "f1",
  status: "suggested",
  suggestion: {
    description: "Add alt",
    proposedSnippet: '<img alt="Hero" />',
    provenance: "ai",
  },
  history: [],
};

const readyPatch = {
  status: "ready" as const,
  candidate: {
    description: "Add alt",
    provenance: "ai" as const,
    edits: [
      {
        path: "a.tsx",
        oldText: "<img />",
        newText: '<img alt="Hero" />',
      },
    ],
    complyLoop: { passed: true, remaining: [] },
  },
};

describe("FindingNextStepPanel", () => {
  it("shows Generate patch for an open source Finding with no patch", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingNextStepPanel
        finding={finding}
        remediation={{ ...rem, status: "detected", suggestion: null }}
        canRemediate
        githubConnected
        prUrl={null}
        aiAvailable
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Fix this Finding" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate patch" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create draft pull request" }),
    ).not.toBeInTheDocument();
  });

  it("shows the patch diff and Create draft PR when a verified patch is ready", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null, prUrl: null },
      vi.fn(),
      false,
    ]);
    const view = render(
      <FindingNextStepPanel
        finding={finding}
        remediation={rem}
        canRemediate
        githubConnected
        prUrl={null}
        aiAvailable
        patchState={readyPatch}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Review patch" }),
    ).toBeInTheDocument();
    expect(screen.getByText("a.tsx")).toBeInTheDocument();
    expect(screen.getByText("ComplyLoop passed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft pull request" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate patch" }),
    ).not.toBeInTheDocument();
    expect(
      within(view.container).getByText("Try another patch"),
    ).toBeInTheDocument();
  });

  it("points at the draft PR and hides Generate once a PR exists", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null, prUrl: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingNextStepPanel
        finding={finding}
        remediation={{ ...rem, status: "approved" }}
        canRemediate
        githubConnected
        prUrl="https://github.com/acme/shop/pull/65"
        aiAvailable
        patchState={readyPatch}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "In review on GitHub" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Merge the draft PR, then re-assessment will verify/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open draft PR" }),
    ).toHaveAttribute("href", "https://github.com/acme/shop/pull/65");
    expect(
      screen.queryByRole("button", { name: "Generate patch" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create draft pull request" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer dismiss once the Finding is verified", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingNextStepPanel
        finding={{
          ...finding,
          status: "resolved",
          resolvedNote: "Fix verified by re-running the automated check.",
        }}
        remediation={{ ...rem, status: "verified" }}
        canRemediate
        githubConnected
        prUrl="https://github.com/acme/shop/pull/65"
        aiAvailable
        patchState={readyPatch}
      />,
    );

    expect(screen.getByRole("heading", { name: "Verified" })).toBeInTheDocument();
    expect(
      screen.queryByText("Not a real failure?"),
    ).not.toBeInTheDocument();
  });

  it("offers Approve for a runtime Finding and never Create draft PR", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingNextStepPanel
        finding={{
          ...finding,
          location: {
            kind: "dom",
            url: "https://example.com/login",
            selector: "input#email",
            snippet: "<input id='email'>",
          },
        }}
        remediation={rem}
        canRemediate
        githubConnected
        prUrl={null}
        aiAvailable
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Review guidance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve remediation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create draft pull request" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate patch" }),
    ).not.toBeInTheDocument();
  });

  it("offers Verify for an implemented runtime Finding", () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    render(
      <FindingNextStepPanel
        finding={{
          ...finding,
          location: {
            kind: "dom",
            url: "https://example.com/login",
            selector: "input#email",
            snippet: "<input id='email'>",
          },
        }}
        remediation={{ ...rem, status: "implemented", suggestion: null }}
        canRemediate
        githubConnected
        prUrl={null}
        aiAvailable
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Confirm the page is fixed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify fix (automated re-check)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate patch" }),
    ).not.toBeInTheDocument();
  });
});
