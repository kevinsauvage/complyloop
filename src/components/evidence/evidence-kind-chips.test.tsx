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
  it("renders tinted badges for each kind filter", () => {
    renderWithUiProviders(
      <EvidenceKindChips
        counts={countsOf({
          finding_detected: 3,
          finding_resolved: 1,
        })}
        selected={undefined}
      />,
    );

    const detected = screen.getByRole("link", { name: /finding detected/i });
    expect(detected.querySelector(".text-status-failed")).not.toBeNull();

    const resolved = screen.getByRole("link", { name: /finding resolved/i });
    expect(resolved.querySelector(".text-status-passed")).not.toBeNull();
  });
});
