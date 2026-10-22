import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionState } from "@/core/actions/action-state";

import { RuntimeAuditForm } from "./runtime-audit-form";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/server/actions/runtime-audit", () => ({
  updateRuntimeAuditAction: async (): Promise<ActionState> => ({
    ok: true,
    message: "Saved.",
  }),
}));

const BASE = "https://preview.example.com";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderForm(props: {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
  maxRoutes?: number;
}) {
  return render(
    <RuntimeAuditForm
      projectId="p1"
      maxRoutes={props.maxRoutes ?? 25}
      {...props}
    />,
  );
}

/** Checkboxes carry the value that gets saved, so read them by their value. */
function routeBoxes(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="runtimeRoutes"]',
    ),
  );
}

function boxFor(path: string): HTMLInputElement {
  const box = routeBoxes().find((candidate) => candidate.value === path);
  if (!box) throw new Error(`No checkbox for ${path}`);
  return box;
}

describe("RuntimeAuditForm", () => {
  it("renders the saved pages as checked boxes that post their own value", () => {
    renderForm({
      runtimeBaseUrl: BASE,
      runtimeRoutes: ["/", "/pricing"],
    });

    expect(boxFor("/").checked).toBe(true);
    expect(boxFor("/pricing").checked).toBe(true);
    expect(boxFor("/").name).toBe("runtimeRoutes");
    expect(boxFor("/").value).toBe("/");
  });

  it("offers the sitemap's pages and pre-selects the site root", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      Response.json({
        source: "robots",
        paths: ["/", "/pricing", "/docs"],
        truncated: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderForm({ runtimeBaseUrl: BASE });

    await user.click(screen.getByRole("button", { name: "Load pages" }));

    await waitFor(() => expect(boxFor("/pricing")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/runtime-routes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(boxFor("/").checked).toBe(true);
    expect(boxFor("/pricing").checked).toBe(false);
    expect(
      screen.getByText(/3 pages found in the sitemap listed in robots.txt/i),
    ).toBeInTheDocument();
  });

  it("says so when the site has no sitemap", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ source: "none", paths: [], truncated: false }),
      ),
    );
    renderForm({ runtimeBaseUrl: BASE });

    await user.click(screen.getByRole("button", { name: "Load pages" }));

    await waitFor(() =>
      expect(
        screen.getByText(/No sitemap found at this URL/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows the refusal message when the URL is rejected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Runtime audit URL cannot target localhost." },
          { status: 422 },
        ),
      ),
    );
    renderForm({ runtimeBaseUrl: "http://127.0.0.1" });

    await user.click(screen.getByRole("button", { name: "Load pages" }));

    await waitFor(() =>
      expect(screen.getByText(/cannot target localhost/i)).toBeInTheDocument(),
    );
  });

  it("adds a hand-typed path, normalized and checked", async () => {
    const user = userEvent.setup();
    renderForm({ runtimeBaseUrl: BASE });

    await user.type(screen.getByLabelText(/Add a page/i), "pricing");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(boxFor("/pricing").checked).toBe(true);
  });

  it("turns a pasted same-host URL into its path", async () => {
    const user = userEvent.setup();
    renderForm({ runtimeBaseUrl: BASE });

    await user.type(
      screen.getByLabelText(/Add a page/i),
      `${BASE}/docs/getting-started`,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(boxFor("/docs/getting-started").checked).toBe(true);
  });

  it("refuses a hand-typed URL on another host instead of saving a doomed value", async () => {
    const user = userEvent.setup();
    renderForm({ runtimeBaseUrl: BASE });

    await user.type(
      screen.getByLabelText(/Add a page/i),
      "https://other.example.com/pricing",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/same host/i);
    expect(routeBoxes()).toHaveLength(0);
  });

  it("stops accepting pages once the audit limit is reached", async () => {
    const user = userEvent.setup();
    renderForm({
      runtimeBaseUrl: BASE,
      runtimeRoutes: ["/", "/pricing"],
      maxRoutes: 2,
    });

    // Both selected boxes stay usable so the user can uncheck them.
    expect(boxFor("/").disabled).toBe(false);
    expect(boxFor("/pricing").disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    await user.click(boxFor("/pricing"));

    expect(boxFor("/pricing").checked).toBe(false);
    // Freed a slot: a page can be added again.
    await user.type(screen.getByLabelText(/Add a page/i), "/docs");
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(boxFor("/docs").checked).toBe(true);
  });

  it("unchecks every page on Clear all", async () => {
    const user = userEvent.setup();
    renderForm({ runtimeBaseUrl: BASE, runtimeRoutes: ["/", "/pricing"] });

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(routeBoxes().every((box) => !box.checked)).toBe(true);
  });

  it("does not submit the form when Enter adds a page", async () => {
    const user = userEvent.setup();
    renderForm({ runtimeBaseUrl: BASE });
    const form = document.querySelector("form");
    const submitted = vi.fn();
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted();
    });

    await user.type(screen.getByLabelText(/Add a page/i), "/pricing{Enter}");

    expect(submitted).not.toHaveBeenCalled();
    expect(boxFor("/pricing").checked).toBe(true);
  });
});
