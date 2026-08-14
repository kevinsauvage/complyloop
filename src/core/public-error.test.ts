import { describe, expect, it } from "vitest";
import { PublicError, isPublicError, publicMessage } from "./public-error";

describe("PublicError", () => {
  it("is detectable as a public, user-safe error", () => {
    const error = new PublicError("Sign in to continue.", "auth");
    expect(isPublicError(error)).toBe(true);
    expect(error.message).toBe("Sign in to continue.");
    expect(error.code).toBe("auth");
    expect(isPublicError(new Error("ENOENT /secret"))).toBe(false);
    expect(isPublicError("boom")).toBe(false);
    expect(publicMessage(error, "Something went wrong.")).toBe(
      "Sign in to continue.",
    );
    expect(publicMessage(new Error("ENOENT /secret"), "Something went wrong.")).toBe(
      "Something went wrong.",
    );
  });
});
