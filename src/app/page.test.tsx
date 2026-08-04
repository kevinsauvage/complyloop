import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders a level-one heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("gives every image an accessible name", () => {
    render(<Home />);
    for (const image of screen.getAllByRole("img")) {
      expect(image).toHaveAccessibleName();
    }
  });
});
