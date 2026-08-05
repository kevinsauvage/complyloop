import type {
  CodeLocation,
  Confidence,
  FindingKind,
  ProposedFix,
  Severity,
} from "@/core/types";
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
  | "aria-hidden-focusable";

export interface RawFinding {
  checkId: CheckId;
  kind: FindingKind;
  severity: Severity;
  confidence: Confidence;
  reason: string;
  location: CodeLocation;
  fix: ProposedFix | null;
}

export interface AccessibilityCheck {
  id: CheckId;
  run(source: ParsedSource): RawFinding[];
}
