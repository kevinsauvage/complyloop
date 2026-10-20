import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RailNav } from "./rail-nav";

afterEach(() => {
  cleanup();
});

describe("RailNav", () => {
  it("renders labelled links with counts and marks the current one", () => {
    render(
      <RailNav
        aria-label="Status"
        heading="Status"
        items={[
          { key: "a", href: "/x", label: "Open", count: 3, current: true },
          {
            key: "b",
            href: "/x?tab=b",
            label: "Done",
            count: 0,
            current: false,
          },
        ]}
        footer={<p>Footnote</p>}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Status" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Done 0" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByText("Footnote")).toBeInTheDocument();
  });
});
