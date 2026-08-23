import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionFeedback } from "./action-feedback";

describe("ActionFeedback", () => {
  it("renders errors as an alert", () => {
    render(
      <ActionFeedback state={{ error: "Not allowed.", message: null }} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Not allowed.");
  });

  it("renders success as a status region", () => {
    render(
      <ActionFeedback state={{ error: null, message: "Saved." }} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("renders nothing when idle", () => {
    const { container } = render(
      <ActionFeedback state={{ error: null, message: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
