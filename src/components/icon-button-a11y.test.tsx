import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/server/actions/auth", () => ({
  signOutAction: vi.fn(),
  signInWithGitHubAction: vi.fn(),
}));

import { XIcon } from "lucide-react";

import { AuthControls } from "./auth-controls";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

afterEach(() => {
  cleanup();
});

describe("icon-button a11y", () => {
  it("theme toggle exposes an accessible name and pressed state", () => {
    render(<ThemeToggle compact />);
    const toggle = screen.getByRole("button", {
      name: "Toggle light and dark theme",
    });
    expect(toggle).toHaveAttribute("aria-label", "Toggle light and dark theme");
    expect(toggle).toHaveAttribute("aria-pressed");
  });

  it("account avatar trigger exposes an accessible name", () => {
    render(
      <AuthControls
        configured
        user={{ image: null, label: "Ada Lovelace" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Account: Ada Lovelace" }),
    ).toBeInTheDocument();
  });

  it("dialog close button exposes sr-only text", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton.textContent).toMatch(/close/i);
  });

  it("sheet close button exposes sr-only text", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton.textContent).toMatch(/close/i);
  });

  it("icon-only buttons carry an accessible name", () => {
    render(
      <Button type="button" variant="ghost" size="icon">
        <XIcon aria-hidden />
        <span className="sr-only">Close</span>
      </Button>,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
  });
});
