import { describe, expect, it } from "vitest";
import { testProject } from "@/test-fixtures/project";
import {
  effectiveRequirementsPresetId,
  parsePresetIdParam,
  requirementsPageHref,
} from "./requirements-page";

describe("requirements page preset URL", () => {
  const project = testProject({ defaultPresetId: "preset-rgaa-full" });

  it("parses only known preset ids", () => {
    expect(parsePresetIdParam("preset-wcag-aa")).toBe("preset-wcag-aa");
    expect(parsePresetIdParam("nope")).toBeUndefined();
  });

  it("uses the URL preset when present, otherwise the project default", () => {
    expect(
      effectiveRequirementsPresetId(project, "preset-wcag-aa"),
    ).toBe("preset-wcag-aa");
    expect(effectiveRequirementsPresetId(project, undefined)).toBe(
      "preset-rgaa-full",
    );
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
});
