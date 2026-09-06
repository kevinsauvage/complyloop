import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding, Remediation } from "@complyloop/db/types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FindingsBulkList } from "./findings-bulk-list";

vi.mock("@/server/actions/remediation", () => ({
  bulkApproveRemediationsAction: vi.fn(),
  bulkDismissFindingsAction: vi.fn(),
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

const control: Control = {
  id: "c1",
  frameworkId: "fw",
  code: "WCAG 1.3.1",
  secondaryCode: "RGAA 11.1",
  title: "Labels",
  description: "Form controls have labels.",
  checkId: "label",
};

function item(
  finding: Finding,
  remediationStatus: Remediation["status"],
) {
  return { finding, control, remediationStatus };
}

const sourceFinding: Finding = {
  id: "f-source",
  projectId: "p1",
  controlId: control.id,
  assessmentId: "a1",
  checkId: "label",
  status: "open",
  kind: "violation",
  severity: "serious",
  reason: "Missing label",
  confidence: "high",
  location: {
    kind: "source",
    filePath: "Form.tsx",
    line: 1,
    column: 1,
    span: { start: 0, end: 1 },
    snippet: "<input />",
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const runtimeFinding: Finding = {
  ...sourceFinding,
  id: "f-runtime",
  location: {
    kind: "dom",
    url: "https://example.com/login",
    selector: "input#email",
    snippet: "<input id='email'>",
  },
};

describe("FindingsBulkList bulk approve", () => {
  it("offers bulk approve only for runtime findings with suggested guidance", async () => {
    useActionStateMock.mockReturnValue([
      { error: null, message: null },
      vi.fn(),
      false,
    ]);
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <FindingsBulkList
          items={[
            item(sourceFinding, "suggested"),
            item(runtimeFinding, "suggested"),
          ]}
          canRemediate
          listParams={{ tab: "open", page: 1 }}
        />
      </TooltipProvider>,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Select all findings on this page" }),
    );

    expect(
      screen.getByRole("button", { name: "Approve guidance (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve guidance (2)" }),
    ).not.toBeInTheDocument();
  });
});
