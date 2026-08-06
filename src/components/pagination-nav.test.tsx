import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginationNav } from "./pagination-nav";

describe("PaginationNav", () => {
  it("renders next/prev when there are multiple pages", () => {
    render(
      <PaginationNav page={2} totalPages={4} total={100} basePath="/evidence" />,
    );
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/evidence",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/evidence?page=3",
    );
  });

  it("hides itself on a single page", () => {
    const { container } = render(
      <PaginationNav page={1} totalPages={1} total={3} basePath="/evidence" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
