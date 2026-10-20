import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ActiveFilterChip, SearchFilterBar } from "./search-filter-bar";

afterEach(() => {
  cleanup();
});

describe("SearchFilterBar", () => {
  it("renders a labelled search form that submits to the given path with carried state", () => {
    render(
      <SearchFilterBar
        action="/evidence"
        label="Search evidence"
        inputId="q"
        placeholder="Search…"
        defaultValue="abc"
        hiddenFields={{ kind: "finding", tab: undefined }}
      />,
    );

    const form = screen.getByRole("search", { name: "Search evidence" });
    expect(form).toHaveAttribute("action", "/evidence");
    expect(
      screen.getByRole("searchbox", { name: "Search evidence" }),
    ).toHaveValue("abc");
    expect(form.querySelector('input[name="kind"]')).toHaveValue("finding");
    expect(form.querySelector('input[name="tab"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "type",
      "submit",
    );
    // No secondary fields → no disclosure.
    expect(screen.queryByText("Filters")).toBeNull();
  });

  it("opens secondary filters while any filter is active and lists chips with Reset", () => {
    render(
      <SearchFilterBar
        action="/x"
        label="Search x"
        inputId="q"
        placeholder="Search…"
        activeChips={[
          <ActiveFilterChip key="a" href="/x" clearLabel="Clear a">
            A
          </ActiveFilterChip>,
        ]}
        resetHref="/x"
      >
        <input aria-label="Extra" />
      </SearchFilterBar>,
    );

    expect(screen.getByText("Filters").closest("details")).toHaveAttribute(
      "open",
    );
    expect(screen.getByRole("link", { name: "Clear a" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reset" })).toHaveAttribute(
      "href",
      "/x",
    );
  });

  it("keeps secondary filters collapsed when nothing is active", () => {
    render(
      <SearchFilterBar
        action="/x"
        label="Search x"
        inputId="q"
        placeholder="Search…"
      >
        <input aria-label="Extra" />
      </SearchFilterBar>,
    );

    expect(screen.getByText("Filters").closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(screen.queryByRole("link", { name: "Reset" })).toBeNull();
  });
});
