export const REFLOW_VIEWPORT = { width: 320, height: 568 } as const;

export function hasHorizontalOverflow(
  scrollWidth: number,
  clientWidth: number,
  tolerance = 1,
): boolean {
  return scrollWidth > clientWidth + tolerance;
}

export function elementWiderThanViewport(
  elementWidth: number,
  clientWidth: number,
  tolerance = 1,
): boolean {
  return elementWidth > clientWidth + tolerance;
}
