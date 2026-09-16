import { describe, expect, it } from "vitest";

import {
  authorityForCheck,
  deriveStatusForCheck,
  isCompositionSensitiveCheck,
  isHeuristicCheck,
  isHtmlValidateOwnedCheck,
  isPackageTwinSourceCheck,
  isRuntimeOnlyCheck,
  requiresFullTreeScan,
} from "./check-authority";
import {
  CHECK_REGISTRY,
  type CheckId,
  type CheckRegistration,
} from "./check-registry";

const RUNTIME_ONLY_CHECK_IDS: readonly CheckId[] = CHECK_REGISTRY.filter(
  (entry: CheckRegistration) =>
    entry.authority === "runtime_only" || entry.runtimeOnly,
).map((entry: CheckRegistration) => entry.id as CheckId);

const HEURISTIC_CHECK_IDS: readonly CheckId[] = CHECK_REGISTRY.filter(
  (entry: CheckRegistration) => entry.authority === "heuristic",
).map((entry: CheckRegistration) => entry.id as CheckId);

const COMPOSITION_SENSITIVE = [
  "input-label",
  "button-name",
  "anchor-name",
  "form-error-association",
  "heading-order",
  "empty-heading",
  "aria-hidden-focusable",
  "duplicate-id",
  "text-spacing",
] as const;

/** Runtime findings for these ids stay open when axe did not run. */
function keepsRuntimeFindingsOpen(checkId: string): boolean {
  return isCompositionSensitiveCheck(checkId) || isRuntimeOnlyCheck(checkId);
}

describe("check authority", () => {
  it("marks every composition-sensitive AST check", () => {
    for (const checkId of COMPOSITION_SENSITIVE) {
      expect(isCompositionSensitiveCheck(checkId)).toBe(true);
      expect(keepsRuntimeFindingsOpen(checkId)).toBe(true);
    }
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
    expect(isCompositionSensitiveCheck("color-contrast")).toBe(false);
  });

  it("requires a full-tree scan for exactly the cross-file checks", () => {
    // Derived from the registry (not a hardcopy): the scoped-scan guard in
    // `runAssessment` must force a full tree for these and only these.
    const crossFile = CHECK_REGISTRY.filter(
      (entry: CheckRegistration) => entry.crossFile === true,
    ).map((entry: CheckRegistration) => entry.id);
    expect(crossFile.sort()).toEqual([
      "duplicate-id",
      "heading-order",
      "list-structure",
    ]);
    for (const checkId of crossFile) {
      expect(requiresFullTreeScan(checkId)).toBe(true);
    }
    expect(requiresFullTreeScan("img-alt")).toBe(false);
    // Composition-sensitive but file-local: runtime wins the merge, yet a
    // scoped re-scan can still confirm or clear it.
    expect(requiresFullTreeScan("input-label")).toBe(false);
  });

  it("keeps runtime findings open for every runtime-only id", () => {
    // Iterates the source list directly — the rendered-page-only set must not
    // drift from check-authority.ts (a hardcopy rots silently on additions).
    for (const checkId of RUNTIME_ONLY_CHECK_IDS) {
      expect(isRuntimeOnlyCheck(checkId)).toBe(true);
      expect(keepsRuntimeFindingsOpen(checkId)).toBe(true);
    }
    expect(isRuntimeOnlyCheck("img-alt")).toBe(false);
    expect(isRuntimeOnlyCheck("input-label")).toBe(false);
    expect(RUNTIME_ONLY_CHECK_IDS.length).toBeGreaterThan(55);
  });

  it("keeps runtime findings open only for authority-gated ids", () => {
    expect(keepsRuntimeFindingsOpen("color-contrast")).toBe(true);
    expect(keepsRuntimeFindingsOpen("input-label")).toBe(true);
    expect(keepsRuntimeFindingsOpen("empty-heading")).toBe(true);
    expect(keepsRuntimeFindingsOpen("target-size")).toBe(true);
    expect(keepsRuntimeFindingsOpen("target-size-enhanced")).toBe(true);
    expect(keepsRuntimeFindingsOpen("forced-colors")).toBe(true);
    expect(keepsRuntimeFindingsOpen("img-alt")).toBe(false);
  });

  it("marks source package twins without changing authority class", () => {
    expect(isPackageTwinSourceCheck("img-alt")).toBe(true);
    expect(isPackageTwinSourceCheck("video-caption")).toBe(true);
    expect(isPackageTwinSourceCheck("meta-viewport")).toBe(true);
    expect(isPackageTwinSourceCheck("fieldset-legend")).toBe(false);
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
  });

  it("does not treat heuristic AST checks as a pass when they emit nothing", () => {
    expect(isHeuristicCheck("pointer-gesture")).toBe(true);
    expect(isHeuristicCheck("link-explicit-heuristic")).toBe(true);
    expect(isHeuristicCheck("audio-description-track")).toBe(true);
    expect(isHeuristicCheck("audio-description-or-alt")).toBe(true);
    expect(isHeuristicCheck("lang-change")).toBe(true);
    expect(isHeuristicCheck("cryptic-content-alt")).toBe(true);
    expect(isHeuristicCheck("error-prevention")).toBe(true);
    expect(isHeuristicCheck("reduced-motion")).toBe(true);
    expect(isHeuristicCheck("accessible-auth-enhanced")).toBe(true);
    expect(isHeuristicCheck("hover-content")).toBe(true);
    expect(isHeuristicCheck("media-controls-present")).toBe(true);
    expect(isHeuristicCheck("captcha-alternative")).toBe(true);
    expect(isHeuristicCheck("media-identification")).toBe(true);
    expect(isHeuristicCheck("layout-table-linearization")).toBe(true);
    expect(isHeuristicCheck("live-region-updates")).toBe(true);
    expect(isRuntimeOnlyCheck("captcha-alternative")).toBe(false);
    expect(isRuntimeOnlyCheck("hover-content")).toBe(false);
    expect(isHeuristicCheck("blockquote-cite")).toBe(false);
    expect(isHeuristicCheck("img-alt")).toBe(false);
    expect(keepsRuntimeFindingsOpen("pointer-gesture")).toBe(false);
    expect(isRuntimeOnlyCheck("duplicate-page-title")).toBe(true);
  });

  it("classifies with site_level → runtime_only → heuristic → standard", () => {
    expect(authorityForCheck("consistent-nav")).toBe("site_level");
    expect(isRuntimeOnlyCheck("consistent-nav")).toBe(true);

    expect(authorityForCheck("consistent-lang")).toBe("site_level");
    expect(isRuntimeOnlyCheck("consistent-lang")).toBe(false);

    expect(isRuntimeOnlyCheck("label-adjacent")).toBe(true);
    expect(isHeuristicCheck("label-adjacent")).toBe(false);
    expect(authorityForCheck("label-adjacent")).toBe("runtime_only");
    expect(authorityForCheck("video-caption")).toBe("runtime_only");
    expect(authorityForCheck("audio-caption")).toBe("runtime_only");
    expect(authorityForCheck("media-controls-present")).toBe("heuristic");

    expect(authorityForCheck("color-contrast")).toBe("runtime_only");
    expect(authorityForCheck("pointer-gesture")).toBe("heuristic");
    expect(authorityForCheck("input-label")).toBe("standard");
    expect(isCompositionSensitiveCheck("input-label")).toBe(true);
    expect(authorityForCheck("img-alt")).toBe("standard");
  });

  it("never returns a lower class when a higher list also contains the id", () => {
    const dualListed = ["consistent-nav", "consistent-labels"] as const;
    for (const checkId of dualListed) {
      expect(authorityForCheck(checkId)).toBe("site_level");
      expect(isRuntimeOnlyCheck(checkId)).toBe(true);
    }
  });

  it("does not list any check as both runtime-only and heuristic", () => {
    const runtimeOnly = new Set<string>(RUNTIME_ONLY_CHECK_IDS);
    const overlap = HEURISTIC_CHECK_IDS.filter((checkId) =>
      runtimeOnly.has(checkId),
    );
    expect(overlap).toEqual([]);
  });

  it("marks html-validate-owned check ids", () => {
    expect(isHtmlValidateOwnedCheck("markup-nesting")).toBe(true);
    expect(isHtmlValidateOwnedCheck("css-for-presentation")).toBe(true);
    expect(isHtmlValidateOwnedCheck("img-alt")).toBe(false);
  });
});

describe("deriveStatusForCheck", () => {
  it("treats a null check id as manual (never passes)", () => {
    expect(deriveStatusForCheck(null, [])).toBe("unable_to_verify");
    expect(
      deriveStatusForCheck(null, [], { runtimeRan: true, filesScanned: 10 }),
    ).toBe("unable_to_verify");
  });

  it("derives standard checks from findings and scan size", () => {
    expect(deriveStatusForCheck("img-alt", [], { filesScanned: 5 })).toBe(
      "passed",
    );
    expect(deriveStatusForCheck("img-alt", [], { filesScanned: 0 })).toBe(
      "unable_to_verify",
    );
    expect(
      deriveStatusForCheck("img-alt", [{ kind: "violation" }], {
        filesScanned: 5,
      }),
    ).toBe("failed");
    expect(
      deriveStatusForCheck("img-alt", [{ kind: "warning" }], {
        filesScanned: 5,
      }),
    ).toBe("needs_review");
  });

  it("gates runtime-only checks on the runtime run", () => {
    expect(deriveStatusForCheck("video-caption", [])).toBe("unable_to_verify");
    expect(
      deriveStatusForCheck("video-caption", [], { runtimeRan: true }),
    ).toBe("passed");
  });

  it("holds html-validate-owned checks until html-validate ran", () => {
    expect(
      deriveStatusForCheck("markup-nesting", [], { runtimeRan: true }),
    ).toBe("unable_to_verify");
    expect(
      deriveStatusForCheck("markup-nesting", [], {
        runtimeRan: true,
        htmlValidateRan: true,
      }),
    ).toBe("passed");
  });

  it("marks applicable checks not_applicable when runtime confirms it", () => {
    expect(
      deriveStatusForCheck("video-caption", [], {
        runtimeRan: true,
        applicabilityFacts: new Map([["video-caption", "no video on page"]]),
      }),
    ).toBe("not_applicable");
  });
});
