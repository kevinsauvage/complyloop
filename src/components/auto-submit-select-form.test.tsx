import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoSubmitSelectForm } from "./auto-submit-select-form";

afterEach(() => {
  cleanup();
});

describe("AutoSubmitSelectForm", () => {
  it("hides when there is at most one option", () => {
    const { container } = render(
      <AutoSubmitSelectForm
        id="switcher-single"
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
        id="switcher-confirm"
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
    const submitted: Event[] = [];
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted.push(event);
    });

    // Arrow-key exploration must not navigate away.
    await user.selectOptions(select, "b");
    expect(submitted).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Switch" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch" }));
    expect(submitted).toHaveLength(1);
  });

  it("hides the Switch button again when re-selecting the current value", async () => {
    const user = userEvent.setup();
    render(
      <AutoSubmitSelectForm
        id="switcher-reselect"
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
