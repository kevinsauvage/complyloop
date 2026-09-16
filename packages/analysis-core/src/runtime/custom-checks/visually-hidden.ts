/**
 * Deliberately visually-hidden elements (the `sr-only` / `visually-hidden`
 * technique): a ≤1px box combined with a clipping mechanism. Clipping probes
 * (resize-text, text-spacing) must not flag these — the clipping IS the
 * technique, and focus/hover states intentionally reveal the content.
 * Without this exemption every skip link is reported as clipped text.
 *
 * Self-contained: serializes into `page.evaluate` via `toString()`, same
 * pattern as the reflow two-dimensional-layout helper.
 */
export function isVisuallyHiddenByDesign(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width > 1 || rect.height > 1) return false;
  const style = getComputedStyle(el);
  if (style.overflow === "hidden" || style.overflow === "clip") return true;
  if (style.overflowX === "hidden" || style.overflowX === "clip") return true;
  if (style.overflowY === "hidden" || style.overflowY === "clip") return true;
  if (style.clipPath !== "none") return true;
  const clip = style.clip.replace(/\s+/g, "");
  return /^rect\(0(px)?,0(px)?,0(px)?,0(px)?\)$/i.test(clip);
}
