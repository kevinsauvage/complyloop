import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSubmitButton } from "./confirm-submit-button";

afterEach(() => {
  cleanup();
});

describe("ConfirmSubmitButton", () => {
  it("blocks submit when the user cancels confirmation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form id="test-form-cancel" onSubmit={onSubmit}>
        <ConfirmSubmitButton
          label="Delete"
          confirmMessage="Are you sure?"
          formId="test-form-cancel"
          variant="destructive"
        />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows submit when the user confirms", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form id="test-form-confirm" onSubmit={onSubmit}>
        <ConfirmSubmitButton
          label="Delete"
          confirmMessage="Are you sure?"
          formId="test-form-confirm"
          variant="destructive"
        />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
