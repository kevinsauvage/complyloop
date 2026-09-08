import type { Page } from "playwright";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import { measureHoverVsFocusReveal } from "./hover-reveal.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const MAX_TRIGGERS = 8;
const CONTENT_DELTA = 8;

/**
 * WCAG 1.4.13 — content shown on hover must be dismissible with Escape and
 * have a keyboard-equivalent reveal path.
 */
export async function hoverContentViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const triggers = page.locator(
    "[title], [data-tooltip], [aria-haspopup='true']",
  );
  const count = Math.min(await triggers.count(), MAX_TRIGGERS);
  const nodes: CustomViolationNode[] = [];

  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible())) continue;

    const { beforeLen, hoverLen, focusLen, afterEscapeLen } =
      await measureHoverVsFocusReveal(page, trigger, {
        waitMs: 120,
        checkEscape: true,
      });
    if (hoverLen <= beforeLen + CONTENT_DELTA) continue;

    const escapeDismisses =
      (afterEscapeLen ?? hoverLen) <= beforeLen + CONTENT_DELTA;
    const focusReveals = focusLen > beforeLen + CONTENT_DELTA;

    const failures: string[] = [];
    if (!escapeDismisses) {
      failures.push("Escape does not dismiss the hover-revealed content.");
    }
    if (!focusReveals) {
      failures.push("Keyboard focus does not reveal equivalent content.");
    }
    if (failures.length === 0) continue;

    const hit = await trigger.evaluate((el, hitCaptureSrc) => {
      const { captureHit } = new Function(`return (${hitCaptureSrc})`)() as {
        captureHit: (el: Element) => CapturedHit;
      };
      return captureHit(el);
    }, BROWSER_HIT_CAPTURE_SRC);
    nodes.push({
      html: hit.html,
      target: [selectorOf(hit)],
      failureSummary: failures.join(" "),
    });
    if (nodes.length >= 5) break;
  }

  if (nodes.length === 0) return null;

  return {
    id: "hover-content",
    impact: "moderate",
    description:
      "Extra content shown on hover is not dismissible with Escape or lacks a keyboard-equivalent reveal path.",
    help: "WCAG 1.4.13: hover/focus content must be dismissible, hoverable, and keyboard reachable (RGAA 10.13).",
    nodes,
  };
}
