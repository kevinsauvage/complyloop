import {
  classNameTextOf,
  handlerTriggersContextChange,
} from "./heuristic-utils";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const ENTRANCE_ANIMATION =
  /\banimate-(?:in|out)\b|\b(?:fade|slide|zoom|spin|bounce|pulse)-(?:in|out)\b|\btransition(?:-all|-transform|-opacity)?\b/i;

const REDUCED_MOTION_CLASS = /\bmotion-(?:reduce|safe)(?:\:|-\w+)/i;

const ANIMATION_HANDLER_PROPS = [
  "onClick",
  "onPointerDown",
  "onMouseEnter",
  "onMouseOver",
  "onFocus",
];

export const reducedMotionCheck: AccessibilityCheck = {
  id: "reduced-motion",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxTags(source.sourceFile, (node) => {
      const className = classNameTextOf(node);
      if (!className) return;
      if (!ENTRANCE_ANIMATION.test(className)) return;
      if (REDUCED_MOTION_CLASS.test(className)) return;

      const style = getAttribute(node, "style");
      const styleText = style?.initializer?.getText() ?? "";
      if (/prefersReducedMotion|reduceMotion/i.test(styleText)) return;

      if (!handlerTriggersContextChange(node, ANIMATION_HANDLER_PROPS)) {
        const role = getAttribute(node, "role");
        const roleValue = role ? stringValueOf(role) : undefined;
        const interactive =
          ["button", "a", "Link"].includes(tagNameOf(node)) ||
          roleValue === "button";
        if (!interactive) return;
      }

      findings.push({
        checkId: "reduced-motion",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Interaction-triggered animation classes lack an explicit reduced-motion alternative (WCAG 2.3.3).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};
