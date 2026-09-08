import { htmlSnippet } from "../dom-location.ts";
import { selectorRef, type SelectorRef } from "./widget-keyboard-utils.ts";

export type CapturedHit = SelectorRef & { html: string };

/**
 * Normalize + truncate an element's outerHTML and snapshot selector fields.
 * Node-side helper; browser injection uses {@link BROWSER_HIT_CAPTURE_SRC}.
 */
export function captureHit(el: Element): CapturedHit {
  const ref = selectorRef(el);
  return {
    html: htmlSnippet(el.outerHTML || ""),
    id: ref.id,
    role: ref.role,
    tagName: ref.tagName,
  };
}

/**
 * Self-contained source for Playwright `page.evaluate` callbacks — they cannot
 * close over Node imports. Reconstruct with:
 * `new Function(\`return (${BROWSER_HIT_CAPTURE_SRC})\`)()`.
 *
 * Important: do not embed `captureHit.toString()` — Vite SSR rewrites its body
 * to `__vite_ssr_import_*__` bindings that do not exist in the page. Only
 * stringify leaf helpers that close over nothing (`htmlSnippet`, `selectorRef`).
 */
export const BROWSER_HIT_CAPTURE_SRC = `(function hitCaptureSource() {
  ${htmlSnippet.toString()}
  ${selectorRef.toString()}
  function captureHit(el) {
    var ref = selectorRef(el);
    return {
      html: htmlSnippet(el.outerHTML || ""),
      id: ref.id,
      role: ref.role,
      tagName: ref.tagName
    };
  }
  return { captureHit: captureHit, htmlSnippet: htmlSnippet, selectorRef: selectorRef };
})()`;
