import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { wcagFramework } from "@/adapters/wcag/controls";
import {
  controlDisplayCodes,
  groupControlsByTheme,
} from "./control-theme";

function controlById(id: string) {
  const control = rgaaControls.find((candidate) => candidate.id === id);
  if (!control) throw new Error(`Missing control ${id}`);
  return control;
}

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
});
