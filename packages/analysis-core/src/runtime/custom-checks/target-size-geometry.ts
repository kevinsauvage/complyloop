/**
 * WCAG 2.5.8 Target Size (Minimum) geometry.
 * Self-contained helpers so they can be serialized into Playwright evaluate.
 */

export interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function meetsMinimumTargetSize(rect: TargetRect, min = 24): boolean {
  return rect.width >= min && rect.height >= min;
}

/**
 * Spacing exception: a 24px-diameter circle centered on the undersized
 * target does not intersect any other target.
 *
 * `min` is a default argument (not a module close-over) so this stays
 * serializable for Playwright `page.evaluate`.
 */
export function hasSpacingException(
  target: TargetRect,
  others: ReadonlyArray<TargetRect>,
  min = 24,
): boolean {
  const radius = min / 2;
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;

  for (const other of others) {
    if (other === target) continue;
    const closestX = Math.max(other.left, Math.min(cx, other.left + other.width));
    const closestY = Math.max(other.top, Math.min(cy, other.top + other.height));
    const dx = cx - closestX;
    const dy = cy - closestY;
    if (dx * dx + dy * dy < radius * radius) return false;
  }
  return true;
}

export function isInlineTarget(display: string): boolean {
  return display === "inline";
}

export function isUserAgentTarget(
  tagName: string,
  inputType: string | null,
): boolean {
  if (tagName.toLowerCase() !== "input") return false;
  switch (inputType) {
    case "checkbox":
    case "radio":
    case "range":
    case "file":
    case "color":
      return true;
    default:
      return false;
  }
}
