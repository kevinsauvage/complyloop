import type { Confidence, FindingKind, Severity } from "@/core/statuses";
import type { FindingLocation, ProposedFix } from "@/core/finding-types";
import type { ParsedSource } from "./parse";

export type CheckId =
  | "img-alt"
  | "button-name"
  | "html-lang"
  | "positive-tabindex"
  | "input-label"
  | "anchor-name"
  | "heading-order"
  | "empty-heading"
  | "iframe-title"
  | "autoplay-media"
  | "duplicate-id"
  | "form-error-association"
  | "aria-hidden-focusable"
  | "aria-role"
  | "aria-props"
  | "aria-required-attr"
  | "no-autofocus"
  | "keyboard-interaction"
  | "meta-viewport"
  | "list-structure"
  | "color-contrast"
  | "document-title"
  | "bypass"
  | "landmark-one-main"
  | "nested-interactive"
  | "target-size"
  | "autocomplete-valid";

export interface RawFinding {
  checkId: CheckId;
  kind: FindingKind;
  severity: Severity;
  confidence: Confidence;
  reason: string;
  location: FindingLocation;
  fix: ProposedFix | null;
  /** Defaults to `ast` when omitted. */
  engine?: "ast" | "runtime";
}

export interface AccessibilityCheck {
  id: CheckId;
  run(source: ParsedSource): RawFinding[];
}
