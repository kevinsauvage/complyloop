import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { renderWithUiProviders } from "@/test/render-ui";
import { EvidenceKindChips } from "./evidence-kind-chips";

afterEach(() => {
  cleanup();
});

function countsOf(
  entries: Partial<Record<EvidenceKind, number>>,
): Map<EvidenceKind, number> {
  return new Map(Object.entries(entries) as [EvidenceKind, number][]);
}

describe("EvidenceKindChips", () => {
  it("renders a filter link for each kind with its count", () => {
    renderWithUiProviders(
      <EvidenceKindChips
        counts={countsOf({
          finding_detected: 3,
          finding_resolved: 1,
        })}
        selected={undefined}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: (accessibleName) =>
          /finding detected/i.test(accessibleName) &&
          accessibleName.includes("3"),
      }),
    ).toHaveAttribute("href", "/evidence?kind=finding_detected");
    expect(
      screen.getByRole("link", {
        name: (accessibleName) =>
          /finding resolved/i.test(accessibleName) &&
          accessibleName.includes("1"),
      }),
    ).toHaveAttribute("href", "/evidence?kind=finding_resolved");
  });
});
