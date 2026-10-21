import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import { FindingsFilterBar } from "./findings-filter-bar";

afterEach(() => {
  cleanup();
});

describe("FindingsFilterBar", () => {
  it("exposes severity and search controls by accessible name", () => {
    renderWithUiProviders(
      <FindingsFilterBar projectId="p1" params={{ tab: "open", page: 1 }} />,
    );

    expect(
      screen.getByRole("search", { name: /search findings/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
  });

  it("does not auto-submit when a select changes; Apply submits explicitly", async () => {
    const user = userEvent.setup();
    renderWithUiProviders(
      <FindingsFilterBar projectId="p1" params={{ tab: "open", page: 1 }} />,
    );

    const form = screen.getByRole("search", {
      name: /search findings/i,
    }) as HTMLFormElement;
    const submitted: Event[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted.push(event);
    });

    await user.click(screen.getByText("Filters"));
    await user.selectOptions(screen.getByLabelText(/severity/i), "serious");
    expect(submitted).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(submitted).toHaveLength(1);
  });

  it("renders an active-filter chip per applied filter with a clear link", () => {
    renderWithUiProviders(
      <FindingsFilterBar
        projectId="p1"
        params={{ tab: "open", page: 1, severity: "serious", q: "color" }}
      />,
    );

    const active = screen.getByRole("list", { name: /active filters/i });
    expect(active).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /clear severity filter/i }),
    ).toHaveAttribute("href", "/projects/p1/findings?q=color");
    expect(
      screen.getByRole("link", { name: /clear search filter/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reset" })).toHaveAttribute(
      "href",
      "/projects/p1/findings",
    );
  });
});
