import { describe, expect, it } from "vitest";

import {
  type FocusStyleSnapshot,
  hasVisibleFocusIndicator,
  snapshotFocusStyles,
} from "./focus";

function snap(overrides: Partial<FocusStyleSnapshot> = {}): FocusStyleSnapshot {
  return {
    outlineStyle: "none",
    outlineWidth: "0px",
    outlineColor: "rgb(0, 0, 0)",
    boxShadow: "none",
    borderTopWidth: "0px",
    borderTopColor: "rgb(0, 0, 0)",
    borderRightWidth: "0px",
    borderRightColor: "rgb(0, 0, 0)",
    borderBottomWidth: "0px",
    borderBottomColor: "rgb(0, 0, 0)",
    borderLeftWidth: "0px",
    borderLeftColor: "rgb(0, 0, 0)",
    backgroundColor: "rgb(255, 255, 255)",
    ...overrides,
  };
}

const unfocused = snap();

describe("snapshotFocusStyles", () => {
  it("copies computed-style fields into a snapshot", () => {
    expect(
      snapshotFocusStyles({
        outlineStyle: "solid",
        outlineWidth: "2px",
        outlineColor: "rgb(0, 0, 0)",
        boxShadow: "none",
        borderTopWidth: "1px",
        borderTopColor: "rgb(0, 0, 0)",
        borderRightWidth: "1px",
        borderRightColor: "rgb(0, 0, 0)",
        borderBottomWidth: "1px",
        borderBottomColor: "rgb(0, 0, 0)",
        borderLeftWidth: "1px",
        borderLeftColor: "rgb(0, 0, 0)",
        backgroundColor: "rgb(255, 255, 255)",
      }),
    ).toEqual({
      outlineStyle: "solid",
      outlineWidth: "2px",
      outlineColor: "rgb(0, 0, 0)",
      boxShadow: "none",
      borderTopWidth: "1px",
      borderTopColor: "rgb(0, 0, 0)",
      borderRightWidth: "1px",
      borderRightColor: "rgb(0, 0, 0)",
      borderBottomWidth: "1px",
      borderBottomColor: "rgb(0, 0, 0)",
      borderLeftWidth: "1px",
      borderLeftColor: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)",
    });
  });
});

describe("hasVisibleFocusIndicator", () => {
  it("accepts the user-agent auto outline", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({ outlineStyle: "auto", outlineWidth: "1px" }),
        unfocused,
      ),
    ).toBe(true);
  });

  it("accepts an outline that appears on focus", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({
          outlineStyle: "solid",
          outlineWidth: "2px",
          outlineColor: "rgb(0, 80, 255)",
        }),
        unfocused,
      ),
    ).toBe(true);
  });

  it("accepts a box-shadow / ring that appears on focus", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({ boxShadow: "0 0 0 3px rgb(0, 80, 255)" }),
        unfocused,
      ),
    ).toBe(true);
  });

  it("accepts a border color or width change as the indicator", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({
          borderTopWidth: "2px",
          borderRightWidth: "2px",
          borderBottomWidth: "2px",
          borderLeftWidth: "2px",
          borderTopColor: "rgb(0, 80, 255)",
          borderRightColor: "rgb(0, 80, 255)",
          borderBottomColor: "rgb(0, 80, 255)",
          borderLeftColor: "rgb(0, 80, 255)",
        }),
        unfocused,
      ),
    ).toBe(true);
  });

  it("accepts a background color change as the indicator", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({ backgroundColor: "rgb(0, 80, 255)" }),
        unfocused,
      ),
    ).toBe(true);
  });

  it("rejects a transparent outline with no other change", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({
          outlineStyle: "solid",
          outlineWidth: "2px",
          outlineColor: "rgba(0, 0, 0, 0)",
        }),
        unfocused,
      ),
    ).toBe(false);
  });

  it("rejects the transparent keyword as an outline color", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({
          outlineStyle: "solid",
          outlineWidth: "2px",
          outlineColor: "transparent",
        }),
        unfocused,
      ),
    ).toBe(false);
  });

  it("rejects outline auto when focused and unfocused styles match", () => {
    const autoOutline = snap({ outlineStyle: "auto", outlineWidth: "1px" });
    expect(hasVisibleFocusIndicator(autoOutline, autoOutline)).toBe(false);
  });

  it("rejects outline none and zero-width outlines", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({ outlineStyle: "none", outlineWidth: "0px" }),
        unfocused,
      ),
    ).toBe(false);
  });

  it("rejects a border color change with zero border width", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({
          borderTopColor: "rgb(0, 80, 255)",
          borderRightColor: "rgb(0, 80, 255)",
          borderBottomColor: "rgb(0, 80, 255)",
          borderLeftColor: "rgb(0, 80, 255)",
        }),
        unfocused,
      ),
    ).toBe(false);
  });

  it("treats opaque rgb outline colors as visible", () => {
    expect(
      hasVisibleFocusIndicator(
        snap({
          outlineStyle: "solid",
          outlineWidth: "2px",
          outlineColor: "rgb(0, 80, 255)",
        }),
        snap({
          outlineStyle: "none",
          outlineWidth: "0px",
          outlineColor: "rgb(0, 0, 0)",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a persistent box-shadow that does not change on focus", () => {
    const shadow = "0 1px 2px rgb(0, 0, 0)";
    expect(
      hasVisibleFocusIndicator(
        snap({ boxShadow: shadow }),
        snap({ boxShadow: shadow }),
      ),
    ).toBe(false);
  });

  it("rejects identical focused and unfocused styles", () => {
    expect(hasVisibleFocusIndicator(unfocused, unfocused)).toBe(false);
  });
});
