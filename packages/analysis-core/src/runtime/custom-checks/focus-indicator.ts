/**
 * Focus-visibility comparison (WCAG 2.4.7 / RGAA 10.7).
 *
 * Looking at the focused computed style alone false-positives border-only
 * indicators and false-negatives persistent shadows. The indicator is the
 * *difference* between focused and unfocused appearance.
 *
 * Self-contained so it can be serialized into Playwright `page.evaluate`.
 */

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

export function snapshotFocusStyles(style: {
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
}): FocusStyleSnapshot {
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

export function hasVisibleFocusIndicator(
  focused: FocusStyleSnapshot,
  unfocused: FocusStyleSnapshot,
): boolean {
  function transparent(color: string): boolean {
    if (color === "transparent") return true;
    const match = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/.exec(
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

  if (focused.boxShadow !== unfocused.boxShadow && focused.boxShadow !== "none") {
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
