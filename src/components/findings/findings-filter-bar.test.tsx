import { cleanup, screen } from "@testing-library/react";
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
});
