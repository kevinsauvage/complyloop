import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  maxCheckoutBytes,
  maxCheckoutFiles,
  maxRuntimePages,
} from "./assessment-limits";

const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  ORIGINAL.ASSESSMENT_MAX_CHECKOUT_BYTES = process.env.ASSESSMENT_MAX_CHECKOUT_BYTES;
  ORIGINAL.ASSESSMENT_MAX_CHECKOUT_FILES = process.env.ASSESSMENT_MAX_CHECKOUT_FILES;
  ORIGINAL.ASSESSMENT_MAX_RUNTIME_PAGES = process.env.ASSESSMENT_MAX_RUNTIME_PAGES;
  delete process.env.ASSESSMENT_MAX_CHECKOUT_BYTES;
  delete process.env.ASSESSMENT_MAX_CHECKOUT_FILES;
  delete process.env.ASSESSMENT_MAX_RUNTIME_PAGES;
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("assessment runtime limits (contract)", () => {
  it("defaults to 500 MiB checkout and 50k files, 25 runtime pages", () => {
    expect(maxCheckoutBytes()).toBe(500 * 1024 * 1024);
    expect(maxCheckoutFiles()).toBe(50_000);
    expect(maxRuntimePages()).toBe(25);
  });

  it("reads valid positive overrides from the environment", () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = "1048576";
    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "100";
    process.env.ASSESSMENT_MAX_RUNTIME_PAGES = "3";

    expect(maxCheckoutBytes()).toBe(1_048_576);
    expect(maxCheckoutFiles()).toBe(100);
    expect(maxRuntimePages()).toBe(3);
  });

  it("falls back for non-positive or non-integer values", () => {
    process.env.ASSESSMENT_MAX_CHECKOUT_BYTES = "-5";
    expect(maxCheckoutBytes()).toBe(500 * 1024 * 1024);

    process.env.ASSESSMENT_MAX_CHECKOUT_FILES = "0";
    expect(maxCheckoutFiles()).toBe(50_000);

    process.env.ASSESSMENT_MAX_RUNTIME_PAGES = "abc";
    expect(maxRuntimePages()).toBe(25);
  });
});