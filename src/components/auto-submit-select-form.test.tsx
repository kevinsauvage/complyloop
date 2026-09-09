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

  it("does not submit on change; reveals a Switch button to confirm", async () => {
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

    // Arrow-key exploration must not navigate away.
    await user.selectOptions(select, "b");
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Switch" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch" }));
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it("hides the Switch button again when re-selecting the current value", async () => {
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
    await user.selectOptions(select, "b");
    expect(
      screen.getByRole("button", { name: "Switch" }),
    ).toBeInTheDocument();
    await user.selectOptions(select, "a");
    expect(
      screen.queryByRole("button", { name: "Switch" }),
    ).not.toBeInTheDocument();
  });
});
