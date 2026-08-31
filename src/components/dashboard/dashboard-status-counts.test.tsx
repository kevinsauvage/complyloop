import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RequirementStatus } from "@/core/statuses";
import { renderWithUiProviders } from "@/test/render-ui";
import { DashboardStatusCounts } from "./dashboard-status-counts";

afterEach(() => {
  cleanup();
});

function countsOf(
  entries: Partial<Record<RequirementStatus, number>>,
): Map<RequirementStatus, number> {
  return new Map(
    Object.entries(entries) as [RequirementStatus, number][],
  );
}

describe("DashboardStatusCounts", () => {
  it("links each non-zero status tile to a filtered requirements deep link", () => {
    renderWithUiProviders(
      <DashboardStatusCounts
        counts={countsOf({
          failed: 12,
          needs_review: 3,
          passed: 40,
          not_applicable: 1,
          unable_to_verify: 5,
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /failed/i })).toHaveAttribute(
      "href",
      "/requirements?status=failed",
    );
    expect(
      screen.getByRole("link", { name: /needs review/i }),
    ).toHaveAttribute("href", "/requirements?status=needs_review");
    expect(screen.getByRole("link", { name: /passed/i })).toHaveAttribute(
      "href",
      "/requirements?status=passed",
    );
    expect(
      screen.getByRole("link", { name: /not applicable/i }),
    ).toHaveAttribute("href", "/requirements?status=not_applicable");
    expect(
      screen.getByRole("link", { name: /unable to verify/i }),
    ).toHaveAttribute("href", "/requirements?status=unable_to_verify");
  });

  it("does not link zero-count tiles", () => {
    renderWithUiProviders(
      <DashboardStatusCounts
        counts={countsOf({ failed: 2, passed: 0 })}
      />,
    );

    expect(screen.getByRole("link", { name: /failed/i })).toBeInTheDocument();
    const passedCard = screen.getByText("Passed").closest("div");
    expect(passedCard).toBeTruthy();
    expect(
      within(passedCard!.parentElement as HTMLElement).queryByRole("link"),
    ).toBeNull();
  });
});
