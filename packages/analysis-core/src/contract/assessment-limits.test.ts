import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maxRuntimePages } from "./assessment-limits";

const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  ORIGINAL.ASSESSMENT_MAX_RUNTIME_PAGES = process.env.ASSESSMENT_MAX_RUNTIME_PAGES;
  delete process.env.ASSESSMENT_MAX_RUNTIME_PAGES;
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("assessment runtime limits (contract)", () => {
  it("defaults to 25 runtime pages", () => {
    expect(maxRuntimePages()).toBe(25);
  });

  it("reads valid positive overrides from the environment", () => {
    process.env.ASSESSMENT_MAX_RUNTIME_PAGES = "3";
    expect(maxRuntimePages()).toBe(3);
  });

  it("falls back for non-positive or non-integer values", () => {
    process.env.ASSESSMENT_MAX_RUNTIME_PAGES = "abc";
    expect(maxRuntimePages()).toBe(25);
  });
});
