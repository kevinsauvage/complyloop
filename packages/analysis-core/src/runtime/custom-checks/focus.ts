import type { Page } from "playwright-core";

import { type CapturedHit } from "./hit-capture.ts";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";

export interface FocusStyleSnapshot {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  borderTopWidth: string;
  borderTopColor: string;
  borderRightWidth: string;
  borderRightColor: string;
  borderBottomWidth: string;
  borderBottomColor: string;
  borderLeftWidth: string;
  borderLeftColor: string;
  backgroundColor: string;
}

export function snapshotFocusStyles(
  style: FocusStyleSnapshot,
): FocusStyleSnapshot {
  return {
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
    boxShadow: style.boxShadow,
    borderTopWidth: style.borderTopWidth,
    borderTopColor: style.borderTopColor,
    borderRightWidth: style.borderRightWidth,
    borderRightColor: style.borderRightColor,
    borderBottomWidth: style.borderBottomWidth,
    borderBottomColor: style.borderBottomColor,
    borderLeftWidth: style.borderLeftWidth,
    borderLeftColor: style.borderLeftColor,
    backgroundColor: style.backgroundColor,
  };
}

/**
 * Focus-visibility comparison (WCAG 2.4.7 / RGAA 10.7). Looking at the focused
 * computed style alone false-positives border-only indicators and false-negatives
 * persistent shadows. The indicator is the *difference* between focused and
 * unfocused appearance. Self-contained so it serializes into `page.evaluate`.
 */
export function hasVisibleFocusIndicator(
  focused: FocusStyleSnapshot,
  unfocused: FocusStyleSnapshot,
): boolean {
  function transparent(color: string): boolean {
    if (color === "transparent") return true;
    const match =
      /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/.exec(
        color,
      );
    if (!match) return false;
    return match[1] !== undefined && Number(match[1]) === 0;
  }

  function outlineVisible(snapshot: FocusStyleSnapshot): boolean {
    if (snapshot.outlineStyle === "auto") return true;
    if (snapshot.outlineStyle === "none") return false;
    if ((parseFloat(snapshot.outlineWidth) || 0) <= 0) return false;
    return !transparent(snapshot.outlineColor);
  }

  if (outlineVisible(focused)) {
    const appeared =
      focused.outlineStyle !== unfocused.outlineStyle ||
      focused.outlineWidth !== unfocused.outlineWidth ||
      focused.outlineColor !== unfocused.outlineColor;
    if (appeared) return true;
  }

  if (
    focused.boxShadow !== unfocused.boxShadow &&
    focused.boxShadow !== "none"
  ) {
    return true;
  }

  const borderChanged =
    focused.borderTopWidth !== unfocused.borderTopWidth ||
    focused.borderTopColor !== unfocused.borderTopColor ||
    focused.borderRightWidth !== unfocused.borderRightWidth ||
    focused.borderRightColor !== unfocused.borderRightColor ||
    focused.borderBottomWidth !== unfocused.borderBottomWidth ||
    focused.borderBottomColor !== unfocused.borderBottomColor ||
    focused.borderLeftWidth !== unfocused.borderLeftWidth ||
    focused.borderLeftColor !== unfocused.borderLeftColor;
  if (borderChanged) {
    const width =
      parseFloat(focused.borderTopWidth) ||
      parseFloat(focused.borderRightWidth) ||
      parseFloat(focused.borderBottomWidth) ||
      parseFloat(focused.borderLeftWidth) ||
      0;
    if (width > 0 && !transparent(focused.borderTopColor)) return true;
  }

  return focused.backgroundColor !== unfocused.backgroundColor;
}

/**
 * Returns true when recent Tab focus keys cycle among very few elements — a
 * signal of an unintentional keyboard trap (modals are excluded upstream).
 */
export function isSuspectedKeyboardTrap(
  sequence: readonly string[],
  tailLength = 12,
  maxUniqueFocusables = 2,
): boolean {
  const tail = sequence.slice(-tailLength);
  if (tail.includes("modal")) return false;
  const unique = new Set(
    tail.filter((key) => key !== "body" && key !== "modal"),
  );
  return unique.size <= maxUniqueFocusables;
}

const MAX_TAB_STEPS = 80;
const SNAPSHOT_FOCUS_STYLES_SOURCE = snapshotFocusStyles.toString();
const HAS_VISIBLE_FOCUS_INDICATOR_SOURCE = hasVisibleFocusIndicator.toString();
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Single shared Tab traversal for every focus check on the page.
 *
 * The collectors below used to walk up to MAX_TAB_STEPS each (plus a fifth
 * walk for trap detection) — ~400 sequential Tab + evaluate round trips per
 * page, each paying full price on throttled serverless CPU. One walk
 * evaluates every predicate per stop instead: same per-stop coverage and
 * step cap, roughly a quarter of the round trips.
 */
export async function focusCustomViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const violations: CustomViolation[] = [];

  const collected = await collectFocusWalkViolations(page);
  if (collected.visible.length > 0) {
    violations.push({
      id: "focus-visible",
      impact: "serious",
      description:
        "Focused element has no visible change from its unfocused appearance (outline, ring, border, or background).",
      help: "Keyboard users must see which control has focus (WCAG 2.4.7).",
      nodes: collected.visible,
    });
  }

  if (collected.trap) {
    violations.push({
      id: "keyboard-trap",
      impact: "critical",
      description:
        "Keyboard focus appears trapped in a small set of elements and cannot reach the rest of the page.",
      help: "Users must be able to Tab away from every widget except intentional modal dialogs (WCAG 2.1.2).",
      nodes: [collected.trap],
    });
  }

  if (collected.obscured.length > 0) {
    violations.push({
      id: "focus-not-obscured",
      impact: "serious",
      description:
        "Focused control is covered by another element (sticky header, banner, or overlay).",
      help: "Focused controls must not be fully hidden by other content (WCAG 2.4.11).",
      nodes: collected.obscured,
    });
  }

  if (collected.obscuredEnhanced.length > 0) {
    violations.push({
      id: "focus-not-obscured-enhanced",
      impact: "serious",
      description:
        "Any part of the focused control is covered by other content.",
      help: "No part of the focused control may be hidden (WCAG 2.4.12).",
      nodes: collected.obscuredEnhanced,
    });
  }

  if (collected.appearance.length > 0) {
    violations.push({
      id: "focus-appearance",
      impact: "moderate",
      description:
        "Focus indicator is too thin to meet minimum size requirements.",
      help: "Focus indicators need sufficient area and contrast (WCAG 2.4.13).",
      nodes: collected.appearance,
    });
  }

  return violations;
}

function toViolationNode(capture: CapturedHit): CustomViolationNode {
  return {
    html: capture.html,
    target: [capture.selector],
    elementLabel: capture.elementLabel,
    failureSummary: capture.context,
  };
}

interface FocusStopHit {
  key: string;
  capture: CapturedHit;
}

interface FocusStopResult {
  sequenceKey: string;
  visible: FocusStopHit | null;
  obscured: FocusStopHit | null;
  obscuredEnhanced: FocusStopHit | null;
  appearance: FocusStopHit | null;
}

function takeFocusHit(
  hit: FocusStopHit | null,
  seen: Set<string>,
  nodes: CustomViolationNode[],
): boolean {
  if (!hit || seen.has(hit.key)) return false;
  seen.add(hit.key);
  nodes.push(toViolationNode(hit.capture));
  return true;
}

/**
 * One Tab traversal feeding every focus check: per stop a single evaluate
 * computes the visible/obscured/appearance predicates for the focused
 * element and the trap-analysis sequence key. Predicates are verbatim copies
 * of the former per-collector bodies — only the traversal is shared.
 */
async function collectFocusWalkViolations(page: Page): Promise<{
  visible: CustomViolationNode[];
  trap: CustomViolationNode | null;
  obscured: CustomViolationNode[];
  obscuredEnhanced: CustomViolationNode[];
  appearance: CustomViolationNode[];
}> {
  const visible: CustomViolationNode[] = [];
  const obscured: CustomViolationNode[] = [];
  const obscuredEnhanced: CustomViolationNode[] = [];
  const appearance: CustomViolationNode[] = [];
  const seenVisible = new Set<string>();
  const seenObscured = new Set<string>();
  const seenObscuredEnhanced = new Set<string>();
  const seenAppearance = new Set<string>();
  const sequence: string[] = [];

  const focusableCount = await page.evaluate((selector) => {
    return document.querySelectorAll(selector).length;
  }, FOCUSABLE_SELECTOR);

  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });

  const unfocusedSnapshots = await page.evaluate(
    ({ snapshotSrc, selector }) => {
      const snapshot = new Function(
        `return (${snapshotSrc})`,
      )() as typeof snapshotFocusStyles;
      return Array.from(document.querySelectorAll(selector)).map((el) =>
        snapshot(getComputedStyle(el)),
      );
    },
    {
      snapshotSrc: SNAPSHOT_FOCUS_STYLES_SOURCE,
      selector: FOCUSABLE_SELECTOR,
    },
  );

  for (let stop = 0; stop < MAX_TAB_STEPS; stop++) {
    await page.keyboard.press("Tab");
    const result: FocusStopResult = await pageEvaluateWithHitCapture(
      page,
      (captureHit, { snapshotSrc, indicatorSrc, selector, unfocused }) => {
        const snapshot = new Function(
          `return (${snapshotSrc})`,
        )() as typeof snapshotFocusStyles;
        const indicatorVisible = new Function(
          `return (${indicatorSrc})`,
        )() as typeof hasVisibleFocusIndicator;

        function sequenceKey(): string {
          const active = document.activeElement;
          if (!active || active === document.body) return "body";
          if (
            active.closest('[aria-modal="true"]') !== null ||
            active.closest("dialog[open]") !== null
          ) {
            return "modal";
          }
          const html = active as HTMLElement;
          if (html.id) return `#${html.id}`;
          return `${html.tagName.toLowerCase()}:${html.className}`;
        }

        function pointObscured(target: Element, x: number, y: number): boolean {
          const top = document.elementFromPoint(x, y);
          if (!top) return false;
          return (
            top !== target && !target.contains(top) && !top.contains(target)
          );
        }

        function firstObscuredCorner(
          target: Element,
          strict: boolean,
        ): { x: number; y: number; corner: string } | undefined {
          const rect = target.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return undefined;
          const corners = strict
            ? [
                { corner: "top-left", x: rect.left + 1, y: rect.top + 1 },
                { corner: "top-right", x: rect.right - 1, y: rect.top + 1 },
                { corner: "bottom-left", x: rect.left + 1, y: rect.bottom - 1 },
                {
                  corner: "bottom-right",
                  x: rect.right - 1,
                  y: rect.bottom - 1,
                },
                {
                  corner: "center",
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
              ]
            : [
                {
                  corner: "center",
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
              ];
          return corners.find((corner) =>
            pointObscured(target, corner.x, corner.y),
          );
        }

        function indicatorTooSmall(target: Element): boolean {
          const style = getComputedStyle(target);
          const outlineWidth = parseFloat(style.outlineWidth) || 0;
          if (outlineWidth >= 2) return false;
          const shadow = style.boxShadow;
          if (!shadow || shadow === "none") return true;
          const match = /(\d+(?:\.\d+)?)px/.exec(shadow);
          if (!match) return true;
          return parseFloat(match[1] ?? "0") < 2;
        }

        const key = sequenceKey();
        const none = {
          sequenceKey: key,
          visible: null,
          obscured: null,
          obscuredEnhanced: null,
          appearance: null,
        };

        const el = document.activeElement;
        if (
          !el ||
          el === document.body ||
          el === document.documentElement ||
          !(el instanceof HTMLElement)
        ) {
          return none;
        }
        if (!el.matches(":focus-visible")) return none;

        let visibleHit: FocusStopHit | null = null;
        const focusables = Array.from(document.querySelectorAll(selector));
        const rest = unfocused[focusables.indexOf(el)];
        if (rest) {
          const focused = snapshot(getComputedStyle(el));
          if (!indicatorVisible(focused, rest)) {
            const capture = captureHit(el);
            visibleHit = { key: capture.selector, capture };
          }
        }

        let obscuredHit: FocusStopHit | null = null;
        const obscuredAt = firstObscuredCorner(el, false);
        if (obscuredAt) {
          const capture = captureHit(el, { obscuredAt });
          obscuredHit = { key: capture.selector, capture };
        }

        let obscuredEnhancedHit: FocusStopHit | null = null;
        const obscuredAtStrict = firstObscuredCorner(el, true);
        if (obscuredAtStrict) {
          const capture = captureHit(el, { obscuredAt: obscuredAtStrict });
          obscuredEnhancedHit = { key: capture.selector, capture };
        }

        let appearanceHit: FocusStopHit | null = null;
        if (indicatorTooSmall(el)) {
          const capture = captureHit(el);
          appearanceHit = { key: capture.selector, capture };
        }

        return {
          sequenceKey: key,
          visible: visibleHit,
          obscured: obscuredHit,
          obscuredEnhanced: obscuredEnhancedHit,
          appearance: appearanceHit,
        };
      },
      {
        snapshotSrc: SNAPSHOT_FOCUS_STYLES_SOURCE,
        indicatorSrc: HAS_VISIBLE_FOCUS_INDICATOR_SOURCE,
        selector: FOCUSABLE_SELECTOR,
        unfocused: unfocusedSnapshots,
      },
    );
    sequence.push(result.sequenceKey);
    let fresh = false;
    fresh = takeFocusHit(result.visible, seenVisible, visible) || fresh;
    fresh = takeFocusHit(result.obscured, seenObscured, obscured) || fresh;
    fresh =
      takeFocusHit(
        result.obscuredEnhanced,
        seenObscuredEnhanced,
        obscuredEnhanced,
      ) || fresh;
    fresh =
      takeFocusHit(result.appearance, seenAppearance, appearance) || fresh;
    if (
      stop > 5 &&
      !fresh &&
      seenVisible.size +
        seenObscured.size +
        seenObscuredEnhanced.size +
        seenAppearance.size >
        0
    ) {
      break;
    }
  }

  let trap: CustomViolationNode | null = null;
  if (focusableCount >= 3 && isSuspectedKeyboardTrap(sequence)) {
    const trapHit = await pageEvaluateWithHitCapture(page, (captureHit) => {
      function isIntentionalModalTrap(el: Element | null): boolean {
        if (!el) return false;
        return (
          el.closest('[aria-modal="true"]') !== null ||
          el.closest("dialog[open]") !== null
        );
      }

      const el = document.activeElement;
      if (!el || el === document.body || isIntentionalModalTrap(el))
        return null;
      if (!(el instanceof HTMLElement)) return null;
      return captureHit(el);
    });
    trap = trapHit ? toViolationNode(trapHit) : null;
  }

  return { visible, trap, obscured, obscuredEnhanced, appearance };
}
