import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
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
    const requestSubmit = vi.fn();
    form.requestSubmit = requestSubmit;

    await user.selectOptions(screen.getByLabelText(/severity/i), "serious");
    expect(requestSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(requestSubmit).toHaveBeenCalledOnce();
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
