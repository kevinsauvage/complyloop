import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EvidenceTimeline } from "./evidence-timeline";

afterEach(() => {
  cleanup();
});

describe("EvidenceTimeline", () => {
  it("renders items oldest-last with a Latest pill on the first", () => {
    render(
      <EvidenceTimeline
        label="Trail"
        items={[
          {
            id: "a",
            badge: <span>Badge A</span>,
            date: <time>today</time>,
            children: <p>first summary</p>,
          },
          {
            id: "b",
            badge: <span>Badge B</span>,
            date: <time>yesterday</time>,
          },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Trail" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByText("first summary")).toBeInTheDocument();
  });

  it("highlights an explicit latest item instead of the first", () => {
    render(
      <EvidenceTimeline
        label="Trail"
        items={[
          {
            id: "a",
            badge: <span>A</span>,
            date: <time>x</time>,
            isLatest: false,
          },
          {
            id: "b",
            badge: <span>B</span>,
            date: <time>y</time>,
            isLatest: true,
          },
        ]}
      />,
    );
    const pills = screen.getAllByText("Latest");
    expect(pills).toHaveLength(1);
    expect(pills[0]?.closest("li")).toHaveTextContent("B");
  });
});
