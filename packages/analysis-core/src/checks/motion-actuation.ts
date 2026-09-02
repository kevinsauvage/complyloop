import { locationOf } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";
import { walkMotionActuationCalls } from "./heuristic-utils";

export const motionActuationCheck: AccessibilityCheck = {
  id: "motion-actuation",
  run(source) {
    const findings: RawFinding[] = [];
    walkMotionActuationCalls(source.sourceFile, (call) => {
      findings.push({
        checkId: "motion-actuation",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: "Uses a device motion or orientation sensor (deviceorientation/devicemotion). Provide a non-motion alternative (button or keyboard) so users who cannot perform the motion can still act (WCAG 2.5.4).",
        location: locationOf(source, call),
        fix: null,
      });
    });
    return findings;
  },
};
