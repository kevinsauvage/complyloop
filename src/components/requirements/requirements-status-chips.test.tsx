import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";
import { renderWithUiProviders } from "@/test/render-ui";
import { RequirementsStatusChips } from "./requirements-status-chips";

const defaultPresetId = "preset-rgaa-full";

afterEach(() => {
  cleanup();
});

function countsOf(
  entries: Partial<Record<RequirementStatus, number>>,
): Record<RequirementStatus, number> {
  return Object.fromEntries(
    REQUIREMENT_STATUSES.map((status) => [status, entries[status] ?? 0]),
  ) as Record<RequirementStatus, number>;
}

function renderChips(
  props: Partial<{
    counts: Record<RequirementStatus, number>;
    selected: RequirementStatus | undefined;
    presetId: string;
    defaultPresetId: string;
  }> = {},
) {
  return renderWithUiProviders(
    <RequirementsStatusChips
      counts={props.counts ?? countsOf({ failed: 12, passed: 4 })}
      selected={props.selected}
      presetId={props.presetId ?? defaultPresetId}
      defaultPresetId={props.defaultPresetId ?? defaultPresetId}
    />,
  );
}

describe("RequirementsStatusChips", () => {
  it("links each status chip to a deep link and marks the active filter", () => {
    renderChips({ selected: "failed" });

    const failed = screen.getByRole("link", { name: /failed/i });
    expect(failed).toHaveAttribute("aria-pressed", "true");
    expect(failed).toHaveAttribute("href", "/requirements");

    const passed = screen.getByRole("link", { name: /passed/i });
    expect(passed).toHaveAttribute("aria-pressed", "false");
    expect(passed).toHaveAttribute("href", "/requirements?status=passed");
  });

  it("preserves a non-default preset in status links", () => {
    renderChips({
      selected: "failed",
      presetId: "preset-wcag-aa",
    });

    expect(screen.getByRole("link", { name: /failed/i })).toHaveAttribute(
      "href",
      "/requirements?presetId=preset-wcag-aa",
    );
    expect(screen.getByRole("link", { name: /passed/i })).toHaveAttribute(
      "href",
      "/requirements?presetId=preset-wcag-aa&status=passed",
    );
  });

  it("offers an All chip that clears the filter when a status is selected", () => {
    renderChips({
      counts: countsOf({ failed: 2 }),
      selected: "failed",
    });

    const all = screen.getByRole("link", { name: /^all$/i });
    expect(all).toHaveAttribute("href", "/requirements");
  });

  it("hides the All chip when no status filter is active", () => {
    renderChips({
      counts: countsOf({ failed: 2 }),
      selected: undefined,
    });

    expect(screen.queryByRole("link", { name: /^all$/i })).toBeNull();
  });
});
