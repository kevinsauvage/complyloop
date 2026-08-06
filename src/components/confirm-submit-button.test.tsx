import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSubmitButton } from "./confirm-submit-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConfirmSubmitButton", () => {
  it("blocks submit when the user cancels confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <ConfirmSubmitButton
          label="Delete"
          confirmMessage="Are you sure?"
          className="btn"
        />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Are you sure?");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows submit when the user confirms", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <ConfirmSubmitButton
          label="Delete"
          confirmMessage="Are you sure?"
          className="btn"
        />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
