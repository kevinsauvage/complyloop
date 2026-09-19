import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import { ConnectProjectDialog } from "./connect-project-dialog";

afterEach(() => {
  cleanup();
});

describe("ConnectProjectDialog", () => {
  it("opens and closes, exposing the dialog title", async () => {
    const user = userEvent.setup();
    renderWithUiProviders(
      <ConnectProjectDialog triggerLabel="Add project">
        <p>Connect form body</p>
      </ConnectProjectDialog>,
    );

    expect(screen.queryByText("Connect form body")).toBeNull();
    await user.click(screen.getByRole("button", { name: /add project/i }));
    expect(
      screen.getByRole("dialog", { name: /add project/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Connect form body")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
