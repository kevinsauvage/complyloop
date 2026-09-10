import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { presetSummaries } from "@complyloop/analysis-core/adapters/registry";
import { PresetNavigator } from "./preset-navigator";

const presets = presetSummaries();

afterEach(() => {
  cleanup();
});

describe("PresetNavigator", () => {
  it("links presets with shareable URLs and marks the default", () => {
    render(
      <PresetNavigator
        presets={presets}
        defaultPresetId="preset-rgaa-full"
        selectedPresetId="preset-wcag-aa"
        statusFilter={undefined}
      />,
    );

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WCAG 2.2 AA/ })).toHaveAttribute(
      "href",
      "/requirements?presetId=preset-wcag-aa",
    );
    expect(screen.getByRole("link", { name: /Full RGAA 4/ })).toHaveAttribute(
      "href",
      "/requirements",
    );
  });

  it("preserves status in preset links", () => {
    render(
      <PresetNavigator
        presets={presets}
        defaultPresetId="preset-rgaa-full"
        selectedPresetId="preset-wcag-aa"
        statusFilter="failed"
      />,
    );

    expect(screen.getByRole("link", { name: /WCAG 2.2 AA/ })).toHaveAttribute(
      "href",
      "/requirements?presetId=preset-wcag-aa&status=failed",
    );
  });
});
