/** Maximum pixel gap between associated label and field before review. */
export const MAX_LABEL_GAP_PX = 48;

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width?: number;
  height?: number;
}

/** Shortest edge-to-edge distance between two bounding boxes. */
export function gapBetweenRects(a: RectLike, b: RectLike): number {
  const horizontal =
    a.right < b.left
      ? b.left - a.right
      : b.right < a.left
        ? a.left - b.right
        : 0;
  const vertical =
    a.bottom < b.top
      ? b.top - a.bottom
      : b.bottom < a.top
        ? a.top - b.bottom
        : 0;
  return Math.max(horizontal, vertical);
}
