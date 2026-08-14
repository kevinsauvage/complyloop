import { describe, expect, it } from "vitest";
import { RateLimitError } from "./rate-limit";

describe("RateLimitError", () => {
  it("is a public, retryable action error", () => {
    const error = new RateLimitError();
    expect(error.message).toMatch(/too many requests/i);
    expect(error.code).toBe("rate_limit");
  });
});
