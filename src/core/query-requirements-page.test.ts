import { describe, expect, it } from "vitest";
import {
  parsePresetIdParam,
  requirementsPageHref,
} from "./query";

const isValidPresetId = (id: string) =>
  ["preset-rgaa-full", "preset-wcag-aa", "preset-wcag-full"].includes(id);

describe("requirements page preset URL", () => {
  it("parses only known preset ids", () => {
    expect(parsePresetIdParam("preset-wcag-aa", isValidPresetId)).toBe(
      "preset-wcag-aa",
    );
    expect(parsePresetIdParam("nope", isValidPresetId)).toBeUndefined();
    expect(parsePresetIdParam(undefined, isValidPresetId)).toBeUndefined();
    expect(parsePresetIdParam("", isValidPresetId)).toBeUndefined();
  });

  it("accepts the first element of a searchParams array", () => {
    expect(parsePresetIdParam(["preset-wcag-aa", "junk"], isValidPresetId)).toBe(
      "preset-wcag-aa",
    );
    expect(parsePresetIdParam([], isValidPresetId)).toBeUndefined();
  });

  it("omits presetId from the URL when it matches the project default", () => {
    expect(
      requirementsPageHref({
        presetId: "preset-rgaa-full",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements");
    expect(
      requirementsPageHref({
        presetId: "preset-wcag-aa",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements?presetId=preset-wcag-aa");
  });

  it("keeps presetId and status together for shareable links", () => {
    expect(
      requirementsPageHref({
        presetId: "preset-wcag-aa",
        status: "failed",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements?presetId=preset-wcag-aa&status=failed");
  });

  it("emits a status-only link when there is no preset override", () => {
    expect(
      requirementsPageHref({
        status: "needs_review",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements?status=needs_review");
  });
});
