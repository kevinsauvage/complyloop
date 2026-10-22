import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("@/server/auth-session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

import { refresh, requireSignedIn } from "./shared";

afterEach(() => {
  vi.clearAllMocks();
});

describe("refresh", () => {
  it("revalidates the whole app layout when given no paths", () => {
    refresh();
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("revalidates only the given routes, de-duplicated", () => {
    refresh("/projects", "/org", "/projects");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
    expect(revalidatePath).toHaveBeenCalledWith("/org");
    expect(revalidatePath).not.toHaveBeenCalledWith("/", "layout");
  });

  it("passes the page type for a dynamic route pattern", () => {
    // `revalidatePath` requires the type argument for a dynamic segment.
    refresh("/projects/[projectId]/findings");
    expect(revalidatePath).toHaveBeenCalledWith(
      "/projects/[projectId]/findings",
      "page",
    );
  });
});

describe("requireSignedIn", () => {
  it("returns the user id and GitHub login", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", login: "alice" } });
    await expect(requireSignedIn()).resolves.toEqual({
      userId: "u1",
      githubLogin: "alice",
    });
  });

  it("maps a missing login to null", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" } });
    await expect(requireSignedIn()).resolves.toEqual({
      userId: "u1",
      githubLogin: null,
    });
  });

  it("throws the default message when signed out", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSignedIn()).rejects.toThrow("Sign in to continue.");
  });

  it("throws the caller-supplied message", async () => {
    getSession.mockResolvedValue({ user: {} });
    await expect(requireSignedIn("Nope.")).rejects.toThrow("Nope.");
  });
});
