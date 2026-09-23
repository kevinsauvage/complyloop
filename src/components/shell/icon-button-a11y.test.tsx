import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/server/actions/auth", () => ({
  signOutAction: vi.fn(),
  signInWithGitHubAction: vi.fn(),
}));

import { XIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { AuthControls } from "./auth-controls";
import { ThemeToggle } from "./theme-toggle";

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
      <AuthControls configured user={{ image: null, label: "Ada Lovelace" }} />,
    );
    expect(
      screen.getByRole("button", { name: "Account: Ada Lovelace" }),
    ).toBeInTheDocument();
  });

  it("renders the GitHub avatar through next/image with an intrinsic size", async () => {
    // Radix `Avatar.Image` probes `new window.Image()` and only renders its
    // child once that probe reports "loaded"; jsdom never loads images, so
    // stub the probe to succeed.
    class LoadedImage {
      complete = true;
      naturalWidth = 1;
      referrerPolicy = "";
      crossOrigin: string | null = null;
      src = "";
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal("Image", LoadedImage);
    try {
      const { container } = render(
        <AuthControls
          configured
          user={{
            image: "https://avatars.githubusercontent.com/u/1?v=4",
            label: "Ada Lovelace",
          }}
        />,
      );
      await waitFor(() =>
        expect(container.querySelector("img")).toBeInTheDocument(),
      );
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("width", "28");
      expect(img).toHaveAttribute("height", "28");
      expect(img?.getAttribute("src")).toContain(
        "avatars.githubusercontent.com",
      );
    } finally {
      vi.unstubAllGlobals();
    }
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
