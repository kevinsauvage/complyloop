import { htmlSnippet } from "../dom-location.ts";
import {
  accessibleNameOf,
  buildCssSelector,
  describeObscurer,
  escapeAttr,
  roleLabel,
} from "./dom-hit-rich.ts";
import { selectorRef, type SelectorRef } from "./widget-keyboard-utils.ts";

export type CaptureHitOptions = {
  obscuredAt?: { x: number; y: number; corner: string };
};

export type CapturedHit = SelectorRef & {
  html: string;
  /** CSS-path locator (prefer over {@link selectorOf}). */
  selector: string;
  accessibleName: string;
  elementLabel: string;
  context?: string;
};

/**
 * Normalize + truncate an element's outerHTML and snapshot locator fields.
 * Node-side helper; browser injection uses {@link BROWSER_HIT_CAPTURE_SRC}.
 */
export function captureHit(
  el: Element,
  options?: CaptureHitOptions,
): CapturedHit {
  const ref = selectorRef(el);
  const htmlEl = el as HTMLElement;
  const selector = buildCssSelector(el);
  const accessibleName =
    el instanceof HTMLElement ? accessibleNameOf(htmlEl) : "";
  const computedRole =
    el instanceof HTMLElement ? roleLabel(htmlEl) : el.tagName.toLowerCase();
  const elementLabel = accessibleName
    ? `${computedRole} “${accessibleName}”`
    : `${computedRole} (${selector})`;
  const context = options?.obscuredAt
    ? describeObscurer(
        el,
        options.obscuredAt.x,
        options.obscuredAt.y,
        options.obscuredAt.corner,
      )
    : undefined;

  return {
    html: htmlSnippet(el.outerHTML || ""),
    id: ref.id,
    role: ref.role,
    tagName: ref.tagName,
    selector,
    accessibleName,
    elementLabel,
    context,
  };
}

export type HitCaptureHelpers = {
  captureHit: (el: Element, options?: CaptureHitOptions) => CapturedHit;
  htmlSnippet: (html: string) => string;
  selectorRef: (el: Element) => SelectorRef;
};

/**
 * Reconstruct hit-capture helpers from {@link BROWSER_HIT_CAPTURE_SRC}.
 * Single source of truth for the Vite-safe `new Function` reconstitution —
 * do not copy that expression into custom checks.
 *
 * Prefer `pageEvaluateWithHitCapture` / `locatorEvaluateWithHitCapture` in
 * `hit-capture-evaluate.ts` so call sites only receive `captureHit`. For composed
 * helper strings (widget-keyboard, live-region), embed
 * `(${BROWSER_HIT_CAPTURE_SRC})` instead.
 *
 * CSP: strict Content-Security-Policy on an audited page can block `new Function`
 * — see `patterns/multilingual.ts`.
 */
export function loadHitCapture(hitCaptureSrc: string): HitCaptureHelpers {
  return new Function(`return (${hitCaptureSrc})`)() as HitCaptureHelpers;
}

/** Source of {@link loadHitCapture} for evaluate payloads / composed browser scripts. */
export const LOAD_HIT_CAPTURE_SRC = loadHitCapture.toString();

/**
 * Self-contained source for Playwright `page.evaluate` callbacks — they cannot
 * close over Node imports. Reconstruct via {@link loadHitCapture} (or
 * `hit-capture-evaluate.ts` helpers that wrap it).
 *
 * Important: do not embed `captureHit.toString()` — Vite SSR rewrites its body
 * to `__vite_ssr_import_*__` bindings that do not exist in the page. Only
 * stringify leaf helpers that close over nothing (`htmlSnippet`, `selectorRef`,
 * and the helpers in `dom-hit-rich.ts`).
 */
export const BROWSER_HIT_CAPTURE_SRC = `(function hitCaptureSource() {
  ${htmlSnippet.toString()}
  ${selectorRef.toString()}
  ${escapeAttr.toString()}
  ${roleLabel.toString()}
  ${accessibleNameOf.toString()}
  ${buildCssSelector.toString()}
  ${describeObscurer.toString()}
  function captureHit(el, options) {
    var ref = selectorRef(el);
    var selector = buildCssSelector(el);
    var accessibleName = el instanceof HTMLElement ? accessibleNameOf(el) : "";
    var computedRole = el instanceof HTMLElement ? roleLabel(el) : el.tagName.toLowerCase();
    var elementLabel = accessibleName
      ? computedRole + " “" + accessibleName + "”"
      : computedRole + " (" + selector + ")";
    var context = options && options.obscuredAt
      ? describeObscurer(
          el,
          options.obscuredAt.x,
          options.obscuredAt.y,
          options.obscuredAt.corner
        )
      : undefined;
    return {
      html: htmlSnippet(el.outerHTML || ""),
      id: ref.id,
      role: ref.role,
      tagName: ref.tagName,
      selector: selector,
      accessibleName: accessibleName,
      elementLabel: elementLabel,
      context: context
    };
  }
  return { captureHit: captureHit, htmlSnippet: htmlSnippet, selectorRef: selectorRef };
})()`;
