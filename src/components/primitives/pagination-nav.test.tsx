import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PaginationNav } from "./pagination-nav";

afterEach(() => {
  cleanup();
});

describe("PaginationNav", () => {
  it("renders next/prev when there are multiple pages", () => {
    render(
      <PaginationNav
        page={2}
        totalPages={4}
        total={100}
        basePath="/evidence"
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/evidence",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/evidence?page=3",
    );
  });

  it("shows numbered pages and a position label on multiple pages", () => {
    render(
      <PaginationNav
        page={2}
        totalPages={4}
        total={100}
        basePath="/evidence"
        pageSize={25}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "href",
      "/evidence",
    );
    expect(screen.getByText(/26–50 of 100/)).toBeInTheDocument();
  });

  it("keeps a stable (hidden) slot on a single page", () => {
    const { container } = render(
      <PaginationNav page={1} totalPages={1} total={3} basePath="/evidence" />,
    );
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("aria-hidden", "true");
  });
});
