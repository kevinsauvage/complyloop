import { afterEach, describe, expect, it, vi } from "vitest";

const signIn = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  signOut: (...args: unknown[]) => signOut(...args),
}));

import { signInWithGitHubAction, signOutAction } from "./auth";

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth actions", () => {
  it("signs in with GitHub and redirects home", async () => {
    signIn.mockResolvedValue(undefined);
    await signInWithGitHubAction();
    expect(signIn).toHaveBeenCalledWith("github", { redirectTo: "/" });
  });

  it("signs out and redirects home", async () => {
    signOut.mockResolvedValue(undefined);
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
