import type { Page } from "playwright";
import { measureHoverVsFocusReveal } from "./hover-reveal.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf, type SelectorRef } from "./widget-keyboard-utils.ts";

interface HoverKeyboardHit extends SelectorRef {
  html: string;
}

const MAX_TRIGGERS = 12;

export async function cssHoverKeyboardViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const stylesheetHits = await page.evaluate((): HoverKeyboardHit[] => {
    const hits: HoverKeyboardHit[] = [];
    const visibilityProps = ["display", "visibility", "opacity", "height", "max-height"];

    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const selector = rule.selectorText;
        if (!selector.includes(":hover")) continue;
        if (selector.includes(":focus")) continue;
        const revealsContent = visibilityProps.some((prop) => {
          const value = rule.style.getPropertyValue(prop);
          return value.length > 0 && value !== "inherit";
        });
        if (!revealsContent) continue;

        const baseSelector = selector.split(":")[0]?.trim();
        if (!baseSelector) continue;
        let match: Element | null = null;
        try {
          match = document.querySelector(baseSelector);
        } catch {
          continue;
        }
        if (!match) continue;
        const html = match.outerHTML.replace(/\s+/g, " ").trim();
        hits.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          id: match.id, role: match.getAttribute("role"), tagName: match.tagName,
        });
        if (hits.length >= 5) return hits;
      }
    }
    return hits;
  });

  const interactionHits: HoverKeyboardHit[] = [];
  const triggers = page.locator(
    "nav li:has(ul) > a, nav li:has(ul) > button, [aria-haspopup='true']",
  );
  const count = Math.min(await triggers.count(), MAX_TRIGGERS);

  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    const { beforeLen, hoverLen, focusLen } = await measureHoverVsFocusReveal(
      page,
      trigger,
    );

    if (hoverLen > beforeLen + 8 && focusLen < hoverLen - 4) {
      const ref = await trigger.evaluate((el) => ({
        html: el.outerHTML.replace(/\s+/g, " ").trim(),
        id: el.id,
        role: el.getAttribute("role"),
        tagName: el.tagName,
      }));
      interactionHits.push({
        html: ref.html.length > 200 ? `${ref.html.slice(0, 197)}…` : ref.html,
        id: ref.id,
        role: ref.role,
        tagName: ref.tagName,
      });
      if (interactionHits.length >= 3) break;
    }
  }

  const nodes = [...stylesheetHits, ...interactionHits];
  if (nodes.length === 0) return null;

  return {
    id: "css-hover-keyboard",
    impact: "moderate",
    description:
      "Extra content may appear on pointer hover without an equivalent reveal on keyboard focus.",
    help: "Ensure :hover-only menus and tooltips can also be opened with keyboard focus (WCAG 2.1.1 / RGAA 10.14).",
    nodes: nodes.map((hit) => ({ html: hit.html, target: [selectorOf(hit)] })),
  };
}
