import { describe, expect, it } from "vitest";
import {
  hasSpacingException,
  isInlineTarget,
  isUserAgentTarget,
  meetsMinimumTargetSize,
  type TargetRect,
} from "./target-size-geometry";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): TargetRect {
  return { left, top, width, height };
}

describe("meetsMinimumTargetSize", () => {
  it("accepts a 24×24 control", () => {
    expect(meetsMinimumTargetSize(rect(0, 0, 24, 24))).toBe(true);
  });

  it("rejects a control under 24 CSS pixels on either axis", () => {
    expect(meetsMinimumTargetSize(rect(0, 0, 23, 24))).toBe(false);
    expect(meetsMinimumTargetSize(rect(0, 0, 24, 16))).toBe(false);
  });
});

describe("hasSpacingException", () => {
  it("allows an undersized target whose 24px circle misses other targets", () => {
    const small = rect(0, 0, 16, 16);
    const far = rect(40, 0, 16, 16);
    expect(hasSpacingException(small, [far])).toBe(true);
  });

  it("rejects an undersized target that sits against another target", () => {
    const small = rect(0, 0, 16, 16);
    const adjacent = rect(16, 0, 16, 16);
    expect(hasSpacingException(small, [adjacent])).toBe(false);
  });

  it("ignores the target itself when it is included in the neighbor list", () => {
    const small = rect(0, 0, 16, 16);
    expect(hasSpacingException(small, [small])).toBe(true);
  });
});

describe("isInlineTarget", () => {
  it("treats display:inline as the in-sentence exception", () => {
    expect(isInlineTarget("inline")).toBe(true);
    expect(isInlineTarget("inline-block")).toBe(false);
    expect(isInlineTarget("flex")).toBe(false);
  });
});

describe("isUserAgentTarget", () => {
  it("exempts native checkbox, radio, and range controls", () => {
    expect(isUserAgentTarget("input", "checkbox")).toBe(true);
    expect(isUserAgentTarget("input", "radio")).toBe(true);
    expect(isUserAgentTarget("input", "range")).toBe(true);
    expect(isUserAgentTarget("input", "text")).toBe(false);
    expect(isUserAgentTarget("button", null)).toBe(false);
  });
});
