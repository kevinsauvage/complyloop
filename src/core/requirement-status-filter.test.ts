import { describe, expect, it } from "vitest";
import {
  parseRequirementStatusParam,
  requirementsStatusHref,
} from "./query";

describe("parseRequirementStatusParam", () => {
  it("returns a known requirement status", () => {
    expect(parseRequirementStatusParam("failed")).toBe("failed");
    expect(parseRequirementStatusParam("unable_to_verify")).toBe(
      "unable_to_verify",
    );
  });

  it("returns undefined for missing or unknown values", () => {
    expect(parseRequirementStatusParam(undefined)).toBeUndefined();
    expect(parseRequirementStatusParam("")).toBeUndefined();
    expect(parseRequirementStatusParam("bogus")).toBeUndefined();
  });

  it("accepts the first value when Next passes an array", () => {
    expect(parseRequirementStatusParam(["passed", "failed"])).toBe("passed");
  });
});

describe("requirementsStatusHref", () => {
  it("builds a deep link for a status filter", () => {
    expect(requirementsStatusHref("failed")).toBe(
      "/requirements?status=failed",
    );
  });

  it("returns the unfiltered list path when clearing", () => {
    expect(requirementsStatusHref()).toBe("/requirements");
    expect(requirementsStatusHref(undefined)).toBe("/requirements");
  });
});
