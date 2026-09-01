import { afterEach, describe, expect, it } from "vitest";
import {
  maxCheckoutBytes,
  maxCheckoutFiles,
  maxRuntimePages,
} from "./assessment-limits";

const envKeys = [
  "ASSESSMENT_MAX_CHECKOUT_BYTES",
  "ASSESSMENT_MAX_CHECKOUT_FILES",
  "ASSESSMENT_MAX_RUNTIME_PAGES",
] as const;

const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>;

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("assessment-limits env parsing", () => {
  it("uses defaults when unset or invalid", () => {
    for (const key of envKeys) delete process.env[key];
    expect(maxCheckoutBytes()).toBe(500 * 1024 * 1024);
    expect(maxCheckoutFiles()).toBe(50_000);
    expect(maxRuntimePages()).toBe(25);

    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = "0";
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "-3";
    process.env.ASSESSMENT_MAX_RUNTIME_PAGES = "nope";
    expect(maxCheckoutBytes()).toBe(500 * 1024 * 1024);
    expect(maxCheckoutFiles()).toBe(50_000);
    expect(maxRuntimePages()).toBe(25);
  });

  it("accepts positive integer overrides", () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = "1024";
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "3";
    process.env.ASSESSMENT_MAX_RUNTIME_PAGES = "7";
    expect(maxCheckoutBytes()).toBe(1024);
    expect(maxCheckoutFiles()).toBe(3);
    expect(maxRuntimePages()).toBe(7);
  });
});
