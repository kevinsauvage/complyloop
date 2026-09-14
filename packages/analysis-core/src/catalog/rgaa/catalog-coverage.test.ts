import { describe, expect, it } from "vitest";

import { authorityForCheck } from "@complyloop/analysis-core/check-authority";
import { CHECK_IDS } from "@complyloop/analysis-core/check-registry";
import { CHECK_REGISTRY } from "@complyloop/analysis-core/check-registry";
import { allChecks } from "@complyloop/analysis-core/checks/registry";
import { jsxA11yMappedCheckIds } from "@complyloop/analysis-core/jsx-a11y-map";
import { axeMappedCheckIds } from "@complyloop/analysis-core/runtime/axe-map";
import { CUSTOM_PROBE_CHECK_IDS } from "@complyloop/analysis-core/runtime/custom-checks/types";
import { htmlValidateMappedCheckIds } from "@complyloop/analysis-core/runtime/html-validate-map";

import { wcagPresets } from "../wcag/presets.ts";
import { rgaaControls } from "./controls";
import { rgaaPresets } from "./presets";

/** Every RGAA 4.1.2 criterion id, in thematic order. */
const RGAA_412_CRITERIA: readonly string[] = [
  "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9",
  "2.1", "2.2",
  "3.1", "3.2", "3.3",
  "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10",
  "4.11", "4.12", "4.13",
  "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8",
  "6.1", "6.2",
  "7.1", "7.2", "7.3", "7.4", "7.5",
  "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10",
  "9.1", "9.2", "9.3", "9.4",
  "10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9",
  "10.10", "10.11", "10.12", "10.13", "10.14",
  "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9",
  "11.10", "11.11", "11.12", "11.13",
  "12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9",
  "12.10", "12.11",
  "13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9",
  "13.10", "13.11", "13.12",
];

function rgaaCodes(): Set<string> {
  const codes = new Set<string>();
  for (const control of rgaaControls) {
    const match = /^RGAA (\d+\.\d+)$/.exec(control.code);
    if (match?.[1]) codes.add(match[1]);
  }
  return codes;
}

describe("RGAA 4.1.2 catalog coverage", () => {
  it("lists all 106 criteria", () => {
    expect(RGAA_412_CRITERIA).toHaveLength(106);
    expect(new Set(RGAA_412_CRITERIA).size).toBe(106);
  });

  it("has at least one control whose code is RGAA <criterion>", () => {
    const codes = rgaaCodes();
    const missing = RGAA_412_CRITERIA.filter((id) => !codes.has(id));
    expect(missing).toEqual([]);
  });

  it("does not use invalid dotted codes such as 13.9.1", () => {
    for (const control of rgaaControls) {
      expect(control.code).not.toMatch(/^RGAA \d+\.\d+\.\d+$/);
    }
  });

  it("keeps unique control ids and unique checkIds among automated controls", () => {
    const ids = rgaaControls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const checkIds = rgaaControls
      .map((c) => c.checkId)
      .filter((id): id is string => id !== null);
    expect(new Set(checkIds).size).toBe(checkIds.length);
  });

  it("does not bind a catalog checkId unless an engine can emit it", () => {
    const emitted = new Set<string>([
      ...allChecks.map((check) => check.id),
      ...jsxA11yMappedCheckIds(),
      ...axeMappedCheckIds(),
      ...CUSTOM_PROBE_CHECK_IDS,
      ...htmlValidateMappedCheckIds(),
      "broken-link",
    ]);
    const unbound = rgaaControls
      .map((control) => control.checkId)
      .filter((checkId): checkId is string => checkId !== null)
      .filter(
        (checkId) =>
          !emitted.has(checkId) && authorityForCheck(checkId) !== "site_level",
      );
    expect(unbound).toEqual([]);
  });

  it("does not duplicate control ids inside a preset", () => {
    for (const preset of [...rgaaPresets, ...wcagPresets]) {
      expect(new Set(preset.controlIds).size, preset.id).toBe(
        preset.controlIds.length,
      );
    }
  });

  it("only names catalog control ids in presets", () => {
    const known = new Set(rgaaControls.map((control) => control.id));
    for (const preset of [...rgaaPresets, ...wcagPresets]) {
      const unknown = preset.controlIds.filter((id) => !known.has(id));
      expect(unknown, preset.id).toEqual([]);
    }
  });

  it("reaches every CheckId from at least one catalog control", () => {
    const catalogCheckIds = new Set(
      rgaaControls
        .map((control) => control.checkId)
        .filter((checkId): checkId is string => checkId !== null),
    );
    const unreachable = CHECK_IDS.filter((id) => !catalogCheckIds.has(id));
    expect(unreachable).toEqual([]);
  });

  it("keeps the registry and the catalog wired 1:1", () => {
    const controlByCheck = new Map(
      rgaaControls
        .filter((control) => control.checkId !== null)
        .map((control) => [control.checkId as string, control.id] as const),
    );
    for (const entry of CHECK_REGISTRY) {
      const controlId = controlByCheck.get(entry.id);
      expect(controlId, entry.id).toBe(entry.catalogControlId);
    }
    expect(controlByCheck.size).toBe(CHECK_REGISTRY.length);
  });
});
