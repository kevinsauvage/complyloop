import type { CheckId } from "./check-registry.ts";
import type { FindingObservation } from "./contract/finding-types.ts";
import type { ParsedSource } from "./parse.ts";

export interface RawFinding extends FindingObservation {
  checkId: CheckId;
}

export interface AccessibilityCheck {
  id: CheckId;
  run(source: ParsedSource): RawFinding[];
}
