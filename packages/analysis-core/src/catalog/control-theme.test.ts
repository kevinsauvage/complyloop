import { describe, expect, it } from "vitest";

import {
  controlDisplayCodes,
  controlForDisplay,
  groupControlsByTheme,
  secondaryReferenceLabel,
} from "./control-theme";
import { rgaaControls, rgaaFramework } from "./rgaa/controls.ts";
import { wcagFramework } from "./wcag/controls.ts";

function controlById(id: string) {
  const control = rgaaControls.find((candidate) => candidate.id === id);
  if (!control) throw new Error(`Missing control ${id}`);
  return control;
}

describe("secondaryReferenceLabel", () => {
  it("labels WCAG and RGAA cross-references and falls back for others", () => {
    expect(secondaryReferenceLabel("WCAG 1.1.1")).toBe("WCAG");
    expect(secondaryReferenceLabel("RGAA 1.1")).toBe("RGAA");
    expect(secondaryReferenceLabel("ISO 40500")).toBe("Also");
  });
});

describe("controlDisplayCodes", () => {
  it("keeps RGAA as the primary code when that framework is the target", () => {
    expect(controlDisplayCodes(controlById("ctl-img-alt"), rgaaFramework.id)).toEqual({
      code: "RGAA 1.1",
      secondaryCode: "WCAG 1.1.1",
    });
  });

  it("promotes the WCAG reference when WCAG is the assessment target", () => {
    expect(controlDisplayCodes(controlById("ctl-img-alt"), wcagFramework.id)).toEqual({
      code: "WCAG 1.1.1",
      secondaryCode: "RGAA 1.1",
    });
  });
});

describe("controlForDisplay", () => {
  it("returns a control whose primary code matches the WCAG target", () => {
    const display = controlForDisplay(
      controlById("ctl-img-alt"),
      wcagFramework.id,
    );
    expect(display.code).toBe("WCAG 1.1.1");
    expect(display.secondaryCode).toBe("RGAA 1.1");
    // Keeps identity for UI keys.
    expect(display.id).toBe("ctl-img-alt");
    expect(display.title).toBe(controlById("ctl-img-alt").title);
  });

  it("resolves the RGAA reference for a WCAG-coded control (the reported bug case)", () => {
    // ctl-focus-appearance is WCAG-coded (no RGAA equivalent) — it can be shown
    // only under a non-RGAA target. Use a shared RGAA-coded control to prove the
    // RGAA target keeps its native code.
    const display = controlForDisplay(
      controlById("ctl-focus-visible"),
      rgaaFramework.id,
    );
    expect(display.code).toBe("RGAA 10.7");
    expect(display.secondaryCode).toBe("WCAG 2.4.7");
  });
});

describe("groupControlsByTheme", () => {
  it("groups RGAA controls by official RGAA themes and omits empty themes", () => {
    const groups = groupControlsByTheme(
      [controlById("ctl-img-alt"), controlById("ctl-input-label"), controlById("ctl-html-lang")],
      rgaaFramework.id,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Images",
      "Mandatory elements",
      "Forms",
    ]);
    expect(groups[0]?.controls.map((control) => control.id)).toEqual(["ctl-img-alt"]);
    expect(groups[1]?.controls.map((control) => control.id)).toEqual(["ctl-html-lang"]);
    expect(groups[2]?.controls.map((control) => control.id)).toEqual(["ctl-input-label"]);
  });

  it("groups by WCAG POUR principles when WCAG is the assessment target", () => {
    const groups = groupControlsByTheme(
      [controlById("ctl-img-alt"), controlById("ctl-input-label"), controlById("ctl-button-name")],
      wcagFramework.id,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Perceivable",
      "Understandable",
      "Robust",
    ]);
  });

  it("collects controls whose code has no criterion under Other", () => {
    const orphan = {
      id: "ctl-orphan",
      frameworkId: rgaaFramework.id,
      code: "ZZ-42",
      secondaryCode: "N/A",
      title: "Orphan",
      description: "",
      checkId: null,
    };
    const groups = groupControlsByTheme(
      [controlById("ctl-img-alt"), orphan],
      rgaaFramework.id,
    );
    const other = groups.find((group) => group.id === "other");
    expect(other?.label).toBe("Other");
    expect(other?.controls.map((control) => control.id)).toEqual(["ctl-orphan"]);
  });

  it("omits the Other group when every control is categorized", () => {
    const groups = groupControlsByTheme([controlById("ctl-img-alt")], rgaaFramework.id);
    expect(groups.some((group) => group.id === "other")).toBe(false);
  });
});
