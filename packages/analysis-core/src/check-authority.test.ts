import { describe, expect, it } from "vitest";
import {
  authorityForCheck,
  isCompositionSensitiveCheck,
  isHeuristicCheck,
  isHtmlValidateOwnedCheck,
  isPackageTwinSourceCheck,
  isRuntimeOnlyCheck,
  isSiteLevelCheck,
  keepOpenWhenRuntimeScanSkipped,
} from "./check-authority";
import { CHECK_REGISTRY, type CheckId, type CheckRegistration } from "./check-registry";

const RUNTIME_ONLY_CHECK_IDS: readonly CheckId[] = CHECK_REGISTRY
  .filter((entry: CheckRegistration) => entry.runtimeOnly)
  .map((entry: CheckRegistration) => entry.id as CheckId);

const HEURISTIC_CHECK_IDS: readonly CheckId[] = CHECK_REGISTRY
  .filter((entry: CheckRegistration) => entry.authority === "heuristic")
  .map((entry: CheckRegistration) => entry.id as CheckId);

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

describe("check authority", () => {
  it("marks every composition-sensitive AST check", () => {
    for (const checkId of COMPOSITION_SENSITIVE) {
      expect(isCompositionSensitiveCheck(checkId)).toBe(true);
      expect(keepOpenWhenRuntimeScanSkipped(checkId)).toBe(true);
    }
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
    expect(isCompositionSensitiveCheck("color-contrast")).toBe(false);
  });

  it("keeps runtime findings open for every runtime-only id", () => {
    // Iterates the source list directly — the rendered-page-only set must not
    // drift from check-authority.ts (a hardcopy rots silently on additions).
    for (const checkId of RUNTIME_ONLY_CHECK_IDS) {
      expect(isRuntimeOnlyCheck(checkId)).toBe(true);
      expect(keepOpenWhenRuntimeScanSkipped(checkId)).toBe(true);
    }
    expect(isRuntimeOnlyCheck("img-alt")).toBe(false);
    expect(isRuntimeOnlyCheck("input-label")).toBe(false);
    expect(RUNTIME_ONLY_CHECK_IDS.length).toBeGreaterThan(55);
  });

  it("keeps runtime findings open only for authority-gated ids", () => {
    expect(keepOpenWhenRuntimeScanSkipped("color-contrast")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("input-label")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("empty-heading")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("target-size")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("target-size-enhanced")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("forced-colors")).toBe(true);
    expect(keepOpenWhenRuntimeScanSkipped("img-alt")).toBe(false);
  });

  it("marks source package twins without changing authority class", () => {
    expect(isPackageTwinSourceCheck("img-alt")).toBe(true);
    expect(isPackageTwinSourceCheck("video-caption")).toBe(true);
    expect(isPackageTwinSourceCheck("meta-viewport")).toBe(true);
    expect(isPackageTwinSourceCheck("fieldset-legend")).toBe(false);
    expect(isCompositionSensitiveCheck("img-alt")).toBe(false);
  });

  it("does not treat heuristic AST checks as a pass when they emit nothing", () => {
    expect(isHeuristicCheck("image-of-text")).toBe(true);
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
    expect(keepOpenWhenRuntimeScanSkipped("image-of-text")).toBe(false);
    expect(isRuntimeOnlyCheck("duplicate-page-title")).toBe(true);
  });

  it("classifies with site_level → runtime_only → heuristic → standard", () => {
    expect(isSiteLevelCheck("consistent-nav")).toBe(true);
    expect(isRuntimeOnlyCheck("consistent-nav")).toBe(true);
    expect(authorityForCheck("consistent-nav")).toBe("site_level");

    expect(isSiteLevelCheck("consistent-lang")).toBe(true);
    expect(isRuntimeOnlyCheck("consistent-lang")).toBe(false);
    expect(authorityForCheck("consistent-lang")).toBe("site_level");

    expect(isRuntimeOnlyCheck("label-adjacent")).toBe(true);
    expect(isHeuristicCheck("label-adjacent")).toBe(false);
    expect(authorityForCheck("label-adjacent")).toBe("runtime_only");
    expect(authorityForCheck("video-caption")).toBe("runtime_only");
    expect(authorityForCheck("audio-caption")).toBe("runtime_only");
    expect(authorityForCheck("media-controls-present")).toBe("heuristic");

    expect(authorityForCheck("color-contrast")).toBe("runtime_only");
    expect(authorityForCheck("image-of-text")).toBe("heuristic");
    expect(authorityForCheck("input-label")).toBe("standard");
    expect(isCompositionSensitiveCheck("input-label")).toBe(true);
    expect(authorityForCheck("img-alt")).toBe("standard");
  });

  it("never returns a lower class when a higher list also contains the id", () => {
    const dualListed = ["consistent-nav", "consistent-labels"] as const;
    for (const checkId of dualListed) {
      expect(isSiteLevelCheck(checkId)).toBe(true);
      expect(isRuntimeOnlyCheck(checkId)).toBe(true);
      expect(authorityForCheck(checkId)).toBe("site_level");
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
