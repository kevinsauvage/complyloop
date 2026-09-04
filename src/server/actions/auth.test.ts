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
  it("signs in with GitHub and redirects to dashboard by default", async () => {
    signIn.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("callbackUrl", "/dashboard");
    await signInWithGitHubAction(formData);
    expect(signIn).toHaveBeenCalledWith("github", { redirectTo: "/dashboard" });
  });

  it("signs in with a safe callback URL from form data", async () => {
    signIn.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("callbackUrl", "/findings");
    await signInWithGitHubAction(formData);
    expect(signIn).toHaveBeenCalledWith("github", { redirectTo: "/findings" });
  });

  it("rejects unsafe callback URLs", async () => {
    signIn.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("callbackUrl", "//evil.example");
    await signInWithGitHubAction(formData);
    expect(signIn).toHaveBeenCalledWith("github", { redirectTo: "/dashboard" });
  });

  it("signs out and redirects home", async () => {
    signOut.mockResolvedValue(undefined);
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
