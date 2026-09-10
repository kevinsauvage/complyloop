import { describe, expect, it } from "vitest";

import { isPublicError, PublicError,publicMessage } from "./public-error";

describe("PublicError", () => {
  it("is an Error with a stable name and a default user code", () => {
    const error = new PublicError("Something is wrong");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PublicError);
    expect(error.name).toBe("PublicError");
    expect(error.code).toBe("user");
    expect(error.message).toBe("Something is wrong");
  });

  it("accepts a custom code and code defaults to user", () => {
    const error = new PublicError("Maintenance", "maintenance_window");
    expect(error.code).toBe("maintenance_window");
    expect(new PublicError("x").code).toBe("user");
  });
});

describe("isPublicError", () => {
  it("narrows PublicError instances and rejects everything else", () => {
    expect(isPublicError(new PublicError("x"))).toBe(true);
    expect(isPublicError(new Error("x"))).toBe(false);
    expect(isPublicError("x")).toBe(false);
    expect(isPublicError({ message: "x" })).toBe(false);
    expect(isPublicError(null)).toBe(false);
  });
});

describe("publicMessage", () => {
  it("returns the public message for a PublicError", () => {
    expect(publicMessage(new PublicError("Hi"), "fallback")).toBe("Hi");
  });

  it("returns the fallback for any other value", () => {
    expect(publicMessage(new Error("Hi"), "fallback")).toBe("fallback");
    expect(publicMessage("hi", "fallback")).toBe("fallback");
    expect(publicMessage(null, "fallback")).toBe("fallback");
  });
});