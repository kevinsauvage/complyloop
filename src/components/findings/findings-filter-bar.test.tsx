import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithUiProviders } from "@/test/render-ui";

import { FindingsFilterBar } from "./findings-filter-bar";

afterEach(() => {
  cleanup();
});

describe("FindingsFilterBar", () => {
  it("exposes severity and search controls by accessible name", () => {
    renderWithUiProviders(
      <FindingsFilterBar params={{ tab: "open", page: 1 }} />,
    );

    expect(screen.getByRole("form", { name: /findings filter/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
  });

  it("does not auto-submit when a select changes; Apply submits explicitly", async () => {
    const user = userEvent.setup();
    renderWithUiProviders(
      <FindingsFilterBar params={{ tab: "open", page: 1 }} />,
    );

    const form = screen.getByRole("form", {
      name: /findings filter/i,
    }) as HTMLFormElement;
    const submitted: Event[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted.push(event);
    });

    await user.selectOptions(screen.getByLabelText(/severity/i), "serious");
    expect(submitted).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(submitted).toHaveLength(1);
  });

  it("renders an active-filter chip per applied filter with a clear link", () => {
    renderWithUiProviders(
      <FindingsFilterBar
        params={{ tab: "open", page: 1, severity: "serious", q: "color" }}
      />,
    );

    const active = screen.getByRole("list", { name: /active filters/i });
    expect(active).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /clear severity filter/i }),
    ).toHaveAttribute("href", "/findings?q=color");
    expect(
      screen.getByRole("link", { name: /clear search filter/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show filters · 2|hide filters/i }),
    ).toBeInTheDocument();
  });
});
