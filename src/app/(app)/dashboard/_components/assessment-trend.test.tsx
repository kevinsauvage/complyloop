import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssessmentTrend } from "./assessment-trend";

afterEach(() => {
  cleanup();
});

const at = (day: number) => `2026-02-0${day}T12:00:00.000Z`;

describe("AssessmentTrend", () => {
  it("states an unchanged pass rate in words instead of drawing a flat line", () => {
    render(
      <AssessmentTrend
        trend={[
          { at: at(1), passRate: 33 },
          { at: at(2), passRate: 33 },
          { at: at(3), passRate: 33 },
        ]}
      />,
    );

    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(
      screen.getByText("Unchanged across the last 3 assessments."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws the chart when the rate moved", () => {
    render(
      <AssessmentTrend
        trend={[
          { at: at(1), passRate: 30 },
          { at: at(2), passRate: 45 },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: /30% to 45%/ })).toBeInTheDocument();
  });
});
