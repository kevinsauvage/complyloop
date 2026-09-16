import type { Page } from "playwright-core";

import { parseCssColor } from "../css-color.ts";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import { FORCED_COLORS_CONTROL_SELECTOR } from "./interactive-control-selectors.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import { withEmulatedMedia } from "./with-emulated-media.ts";

const PARSE_COLOR_SRC = parseCssColor.toString();

/**
 * Windows High Contrast / forced-colors mode strips decorative boundaries.
 * Emulates `forced-colors: active` and flags interactive controls with no
 * text, border, outline, or filled background under that condition.
 */
export async function forcedColorsViolation(
  page: Page,
): Promise<CustomViolation | null> {
  return withEmulatedMedia(
    page,
    { forcedColors: "active" },
    { forcedColors: "none" },
    async () => {
      const result = await pageEvaluateWithHitCapture(
        page,
        (captureHit, { interactiveSelector, parseColorSrc }) => {
          const parseColor = new Function(
            "value",
            `const parseCssColor = (${parseColorSrc}); return parseCssColor(value);`,
          ) as typeof parseCssColor;
          const maxNodes = 10;

          function isVisible(el: HTMLElement): boolean {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          function hasVisibleBorder(style: CSSStyleDeclaration): boolean {
            return (
              style.borderStyle !== "none" && parseFloat(style.borderWidth) > 0
            );
          }

          function hasVisibleOutline(style: CSSStyleDeclaration): boolean {
            return (
              style.outlineStyle !== "none" &&
              parseFloat(style.outlineWidth) > 0
            );
          }

          /**
           * Graphical content (icons, images, media) renders visibly under
           * forced colors via currentColor/system remapping, so an
           * icon-only control with no text still has a visible boundary.
           * Opacity/display/visibility-hidden graphics do not count.
           */
          function hasVisibleGraphics(target: Element): boolean {
            const self =
              target instanceof Element &&
              /^(svg|img|canvas|video)$/i.test(target.tagName)
                ? [target]
                : [];
            const all = [
              ...self,
              ...Array.from(
                target.querySelectorAll("svg,img,canvas,video"),
              ),
            ];
            return all.some((node) => {
              const rect = node.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return false;
              const nodeStyle = getComputedStyle(node);
              if (
                nodeStyle.display === "none" ||
                nodeStyle.visibility === "hidden"
              ) {
                return false;
              }
              const opacity = Number.parseFloat(nodeStyle.opacity);
              return Number.isNaN(opacity) || opacity > 0;
            });
          }

          const found: CustomViolationNode[] = [];
          const seen = new Set<string>();

          const controls = Array.from(
            document.querySelectorAll<HTMLElement>(interactiveSelector),
          );
          for (const el of controls) {
            if (!el.isConnected) continue;
            if (!isVisible(el)) continue;

            const style = getComputedStyle(el);
            if (hasVisibleBorder(style) || hasVisibleOutline(style)) continue;

            const hasVisibleText = Boolean((el.textContent ?? "").trim());
            if (hasVisibleText) continue;
            if (hasVisibleGraphics(el)) continue;

            const bg = parseColor(style.backgroundColor);
            if (!bg || bg.alpha !== 0) continue;

            const hit = captureHit(el);
            const key = hit.selector;
            if (seen.has(key)) continue;
            seen.add(key);

            found.push({
              html: hit.html,
              target: [key],
              elementLabel:
                el.getAttribute("aria-label") ??
                el.getAttribute("title") ??
                undefined,
              failureSummary:
                "Under forced-colors mode this control has no visible text, border, outline, or filled background.",
            });
            if (found.length >= maxNodes) break;
          }

          return {
            nodes: found,
            controlCount: controls.length,
            forcedActive:
              typeof matchMedia === "function" &&
              matchMedia("(forced-colors: active)").matches,
          };
        },
        {
          interactiveSelector: FORCED_COLORS_CONTROL_SELECTOR,
          parseColorSrc: PARSE_COLOR_SRC,
        },
      );

      // Diagnostic: whether the emulation actually applied decides the
      // verdict (unapplied emulation measures normal-mode colors), so the
      // value is logged with every run.
      console.info(
        `[diag] forced-colors emulated=${result.forcedActive} controls=${result.controlCount}`,
      );
      const nodes = result.nodes;
      if (nodes.length === 0) return null;
      return {
        id: "forced-colors",
        impact: "serious",
        description:
          "An interactive control has no visible boundary under forced-colors mode — no text, border, outline, or filled background.",
        help: "Interactive controls must remain visible under forced-colors / Windows High Contrast.",
        nodes,
      };
    },
  );
}
