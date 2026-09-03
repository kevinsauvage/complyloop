import { describe, expect, it } from "vitest";
import { isKeyboardFocusable, selectorOf } from "./widget-keyboard-utils";

describe("isKeyboardFocusable", () => {
  it("accepts native interactive elements", () => {
    expect(isKeyboardFocusable(document.createElement("button"))).toBe(true);
    expect(isKeyboardFocusable(document.createElement("a"))).toBe(false);
    const link = document.createElement("a");
    link.href = "/x";
    expect(isKeyboardFocusable(link)).toBe(true);
  });

  it("accepts non-native elements with tabindex >= 0", () => {
    const div = document.createElement("div");
    div.setAttribute("tabindex", "0");
    expect(isKeyboardFocusable(div)).toBe(true);
  });

  it("rejects tabindex -1 and hidden inputs", () => {
    const div = document.createElement("div");
    div.setAttribute("tabindex", "-1");
    expect(isKeyboardFocusable(div)).toBe(false);

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    expect(isKeyboardFocusable(hidden)).toBe(false);
  });
});

describe("selectorOf", () => {
  it("prefers id, then role, then tag", () => {
    const el = document.createElement("div");
    el.id = "menu";
    el.setAttribute("role", "menu");
    expect(selectorOf(el)).toBe("#menu");

    el.removeAttribute("id");
    expect(selectorOf(el)).toBe('[role="menu"]');

    el.removeAttribute("role");
    expect(selectorOf(el)).toBe("div");
  });
});
