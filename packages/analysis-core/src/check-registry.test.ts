import { describe, expect, it } from "vitest";

import { CHECK_REGISTRY, type CheckRegistration } from "./check-registry.ts";
import { allChecks } from "./checks/registry.ts";
import {
  ANALYSIS_ENGINE_VERSION,
  checkRegistrySignature,
} from "./checks/registry.ts";
import type { AnalyzerId } from "./contract/finding-types.ts";
import { jsxA11yMappedCheckIds } from "./jsx-a11y-map.ts";
import { axeMappedCheckIds } from "./runtime/axe-map.ts";
import { CUSTOM_PROBE_CHECK_IDS } from "./runtime/custom-checks/types.ts";
import { htmlValidateMappedCheckIds } from "./runtime/html-validate-map.ts";

const BY_ID = new Map<string, CheckRegistration>(
  CHECK_REGISTRY.map((entry) => [entry.id, entry] as const),
);

const declared = (id: string): readonly AnalyzerId[] =>
  BY_ID.get(id)?.analyzers ?? [];

const declaredIdsFor = (analyzer: AnalyzerId): string[] =>
  CHECK_REGISTRY.filter((entry) => declared(entry.id).includes(analyzer)).map(
    (entry) => entry.id,
  );

describe("check registry", () => {
  it("lists every check id exactly once", () => {
    const ids = CHECK_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares each analyzer exactly where that analyzer can emit it", () => {
    const cases: Array<[AnalyzerId, readonly string[]]> = [
      ["ast", allChecks.map((check) => check.id)],
      ["jsx-a11y", jsxA11yMappedCheckIds()],
      ["axe", axeMappedCheckIds()],
      ["html-validate", htmlValidateMappedCheckIds()],
      ["playwright-custom", CUSTOM_PROBE_CHECK_IDS],
    ];
    for (const [analyzer, actualEmitters] of cases) {
      const actual = new Set(actualEmitters);
      for (const checkId of actual) {
        expect(declared(checkId), `${checkId} missing ${analyzer}`).toContain(
          analyzer,
        );
      }
      const declaredIds = declaredIdsFor(analyzer);
      const unexplained = declaredIds.filter((id) => !actual.has(id));
      expect(unexplained, `${analyzer} declared without an emitter`).toEqual(
        [],
      );
    }
  });

  it("declares site-level only for site_level authority and linkinator only for broken-link", () => {
    for (const entry of CHECK_REGISTRY) {
      const isSiteLevel = declared(entry.id).includes("site-level");
      expect(isSiteLevel, entry.id).toBe(entry.authority === "site_level");
      const isLinkinator = declared(entry.id).includes("linkinator");
      expect(isLinkinator, entry.id).toBe(entry.id === "broken-link");
    }
  });

  it("does not list any check as both runtime-only and heuristic", () => {
    const overlap = CHECK_REGISTRY.filter(
      (entry: CheckRegistration) =>
        entry.runtimeOnly === true && entry.authority === "heuristic",
    );
    expect(overlap.map((entry) => entry.id)).toEqual([]);
  });

  it("keeps authority classes and flags disjoint from the analyzer sets", () => {
    for (const entry of CHECK_REGISTRY) {
      expect(entry.authority).toMatch(
        /^(standard|runtime_only|heuristic|site_level)$/,
      );
      expect(entry.catalogControlId).toBeTruthy();
    }
  });

  it("wires each check to a unique catalog control", () => {
    const controlIds = CHECK_REGISTRY.map((entry) => entry.catalogControlId);
    expect(new Set(controlIds).size).toBe(controlIds.length);
  });

  it("signs the engine with its behavior version and every check id", () => {
    const signature = checkRegistrySignature();
    expect(signature.startsWith(`${ANALYSIS_ENGINE_VERSION}#`)).toBe(true);
    for (const check of allChecks) {
      expect(signature).toContain(check.id);
    }
  });
});
