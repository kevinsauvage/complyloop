import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RequirementStatus } from "@/core/statuses";
import { RequirementsStatusChips } from "./requirements-status-chips";

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

describe("RequirementsStatusChips", () => {
  it("links each status chip to a deep link and marks the active filter", () => {
    render(
      <RequirementsStatusChips
        counts={countsOf({ failed: 12, passed: 4 })}
        selected="failed"
      />,
    );

    const failed = screen.getByRole("link", { name: /failed/i });
    expect(failed).toHaveAttribute("aria-current", "true");
    // Selected chip clears the filter when activated again.
    expect(failed).toHaveAttribute("href", "/requirements");

    const passed = screen.getByRole("link", { name: /passed/i });
    expect(passed).not.toHaveAttribute("aria-current");
    expect(passed).toHaveAttribute("href", "/requirements?status=passed");
  });

  it("offers an All chip that clears the filter when a status is selected", () => {
    render(
      <RequirementsStatusChips
        counts={countsOf({ failed: 2 })}
        selected="failed"
      />,
    );

    const all = screen.getByRole("link", { name: /^all$/i });
    expect(all).toHaveAttribute("href", "/requirements");
  });

  it("hides the All chip when no status filter is active", () => {
    render(
      <RequirementsStatusChips
        counts={countsOf({ failed: 2 })}
        selected={undefined}
      />,
    );

    expect(screen.queryByRole("link", { name: /^all$/i })).toBeNull();
  });
});
