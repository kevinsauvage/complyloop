import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import { DeveloperHandoffCard } from "./developer-handoff";

afterEach(() => {
  cleanup();
});

describe("DeveloperHandoffCard", () => {
  it("shows handoff title and hides patch controls when no diff", () => {
    renderWithUiProviders(
      <DeveloperHandoffCard
        handoff={{
          title: "Fix img-alt on Hero",
          body: "## Summary\nAdd alt text.",
          diff: null,
        }}
      />,
    );

    expect(
      screen.getByText(/developer handoff \(patch \/ pr\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Fix img-alt on Hero")).toBeInTheDocument();
    expect(screen.getByText(/no patch available/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download \.patch/i }),
    ).toBeNull();
  });

  it("offers download when a diff is present", () => {
    renderWithUiProviders(
      <DeveloperHandoffCard
        handoff={{
          title: "Fix img-alt on Hero",
          body: "PR body",
          diff: "--- a/x\n+++ b/x\n",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: /download \.patch/i }),
    ).toBeInTheDocument();
  });
});
