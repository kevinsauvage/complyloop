import { afterEach, describe, expect, it } from "vitest";
import {
  RateLimitError,
  assertRateLimit,
  resetRateLimits,
} from "./rate-limit";

afterEach(() => {
  resetRateLimits();
});

describe("assertRateLimit", () => {
  it("allows bursts under the limit then rejects", () => {
    assertRateLimit("k", 3, 60_000);
    assertRateLimit("k", 3, 60_000);
    assertRateLimit("k", 3, 60_000);
    expect(() => assertRateLimit("k", 3, 60_000)).toThrow(RateLimitError);
  });

  it("isolates keys", () => {
    assertRateLimit("a", 1, 60_000);
    expect(() => assertRateLimit("a", 1, 60_000)).toThrow(RateLimitError);
    expect(() => assertRateLimit("b", 1, 60_000)).not.toThrow();
  });
});
