import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoSubmitSelectForm } from "./auto-submit-select-form";

describe("AutoSubmitSelectForm", () => {
  it("hides when there is at most one option", () => {
    const { container } = render(
      <AutoSubmitSelectForm
        id="switcher"
        name="id"
        action="/switch"
        label="Thing"
        defaultValue="a"
        options={[{ value: "a", label: "A" }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("exposes the accessible name and requestSubmits on change", async () => {
    const user = userEvent.setup();
    render(
      <AutoSubmitSelectForm
        id="switcher"
        name="id"
        action="/switch"
        label="Thing"
        defaultValue="a"
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Thing" });
    const form = select.closest("form");
    expect(form).not.toBeNull();
    const requestSubmit = vi.fn();
    if (form) {
      form.requestSubmit = requestSubmit;
    }

    await user.selectOptions(select, "b");
    expect(requestSubmit).toHaveBeenCalledOnce();
  });
});
