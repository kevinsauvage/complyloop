import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";

import { FindingHeader } from "./finding-header";

const control = testControl({
  code: "RGAA 1.1",
  secondaryCode: "WCAG 1.1.1",
  title: "Images have a text alternative",
  description: "Every informative image exposes a text alternative.",
});

function renderHeader(regressionOf?: string) {
  return render(
    <FindingHeader
      finding={testFinding({ regressionOf })}
      control={control}
      remediation={{ status: "suggested" }}
      listParams={{ tab: "open", page: 1 }}
      aiPrompt="# prompt"
    />,
  );
}

describe("FindingHeader", () => {
  it("leads with the requirement title and its references", () => {
    renderHeader();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Images have a text alternative",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("RGAA 1.1 · WCAG 1.1.1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Copy for AI: fix prompt for this finding",
      }),
    ).toBeInTheDocument();
  });

  it("lists the triage facts as a labelled definition list", () => {
    const { container } = renderHeader();
    const terms = [...container.querySelectorAll("dt")].map(
      (term) => term.textContent,
    );
    expect(terms).toEqual([
      "Severity",
      "Status",
      "Remediation",
      "Detected by",
      "Confidence",
      "Check",
    ]);
    const check = container.querySelectorAll("dd")[5] as HTMLElement;
    expect(within(check).getByText("img-alt")).toBeInTheDocument();
    expect(
      within(check).getByRole("button", { name: "Copy check ID" }),
    ).toBeInTheDocument();
  });

  it("links a regression to the earlier finding", () => {
    renderHeader("f0");
    expect(
      screen.getByRole("link", { name: "View the earlier finding" }),
    ).toHaveAttribute("href", expect.stringContaining("/findings/f0"));
    expect(
      screen.getByText(/this instance was fixed before/i),
    ).toBeInTheDocument();
  });
});
