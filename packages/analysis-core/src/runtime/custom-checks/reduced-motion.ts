import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.ts";

interface AnimatedEffect {
  target?: Element | null;
  getTiming?: () => { duration: number | string; iterations: number | string };
}

interface AnimationLike {
  playState?: string;
  effect?: AnimatedEffect | null;
}

/**
 * WCAG 2.3.3 requires that motion from interactions can be disabled through
 * `prefers-reduced-motion` or an equivalent. We emulate the reduced-motion
 * preference and flag CSS / WAAPI animations that keep running — i.e. pages
 * that did not gate their animation behind the media query.
 *
 * Returns a `reduced-motion` finding.
 */
export async function reducedMotionViolation(
  page: Page,
): Promise<CustomViolation | null> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  try {
    const nodes = await page.evaluate(() => {
      const minDurationMs = 250;
      const maxNodes = 10;

      function toMs(duration: number | string): number {
        if (typeof duration === "number") return duration;
        const num = parseFloat(duration);
        return /ms$/i.test(duration) ? num : num * 1000;
      }

      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      const found: CustomViolationNode[] = [];
      const seen = new Set<string>();

      const getAnimations = (
        document as unknown as {
          getAnimations?: () => AnimationLike[];
        }
      ).getAnimations;

      const animations = getAnimations ? getAnimations.call(document) : [];
      for (const animation of animations) {
        if (animation.playState !== "running") continue;
        const effect = animation.effect;
        const el = effect?.target;
        if (!(el instanceof HTMLElement)) continue;
        if (!el.isConnected) continue;

        let duration = 0;
        let iterations = 1;
        if (effect && typeof effect.getTiming === "function") {
          const timing = effect.getTiming();
          duration = toMs(timing.duration);
          iterations =
            typeof timing.iterations === "number" ? timing.iterations : 1;
        }
        const infinite = iterations === Infinity;
        if (!infinite && duration < minDurationMs) continue;

        const key = selectorOf(el);
        if (seen.has(key)) continue;
        seen.add(key);

        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        found.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          target: [key],
          elementLabel:
            el.getAttribute("aria-label") ??
            el.getAttribute("title") ??
            undefined,
          failureSummary: infinite
            ? "Infinite animation keeps running under prefers-reduced-motion."
            : `Animation of ${Math.round(duration)}ms keeps running under prefers-reduced-motion.`,
        });
        if (found.length >= maxNodes) break;
      }

      return found;
    });

    if (nodes.length === 0) return null;
    return {
      id: "reduced-motion",
      impact: "moderate",
      description:
        "A CSS or JavaScript animation keeps running when the user prefers reduced motion.",
      help: "Interaction/ambient motion must be disabled via prefers-reduced-motion or an equivalent mechanism (WCAG 2.3.3).",
      nodes,
    };
  } finally {
    await page.emulateMedia({ reducedMotion: null });
  }
}