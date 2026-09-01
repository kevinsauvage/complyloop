import type { Page } from "playwright";
import type { AxeViolationLike } from "./findings";

const MAX_TAB_STEPS = 80;

/**
 * Playwright-driven keyboard checks that axe does not cover.
 * Returns synthetic violations using complyloop-* ids mapped in axe-map.ts.
 */
export async function runCustomRuntimeChecks(
  page: Page,
): Promise<AxeViolationLike[]> {
  const violations: AxeViolationLike[] = [];

  const focusVisibleNodes = await collectFocusVisibleViolations(page);
  if (focusVisibleNodes.length > 0) {
    violations.push({
      id: "complyloop-focus-visible",
      impact: "serious",
      description:
        "Focused element has no visible focus indicator (outline, ring, or box-shadow).",
      help: "Keyboard users must see which control has focus (WCAG 2.4.7).",
      nodes: focusVisibleNodes,
    });
  }

  const trapNode = await detectKeyboardTrap(page);
  if (trapNode) {
    violations.push({
      id: "complyloop-keyboard-trap",
      impact: "critical",
      description:
        "Keyboard focus appears trapped in a small set of elements and cannot reach the rest of the page.",
      help: "Users must be able to Tab away from every widget except intentional modal dialogs (WCAG 2.1.2).",
      nodes: [trapNode],
    });
  }

  const obscuredNodes = await collectFocusObscuredViolations(page);
  if (obscuredNodes.length > 0) {
    violations.push({
      id: "complyloop-focus-not-obscured",
      impact: "serious",
      description:
        "Focused control is covered by another element (sticky header, banner, or overlay).",
      help: "Focused controls must not be fully hidden by other content (WCAG 2.4.11).",
      nodes: obscuredNodes,
    });
  }

  return violations;
}

async function collectFocusVisibleViolations(
  page: Page,
): Promise<Array<{ html: string; target: string[] }>> {
  const nodes: Array<{ html: string; target: string[] }> = [];
  const seen = new Set<string>();

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(() => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        return role ? `${tag}[role="${role}"]` : tag;
      }

      function hasVisibleFocusIndicator(el: Element): boolean {
        const style = getComputedStyle(el);
        const outlineVisible =
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        if (outlineVisible) return true;
        return Boolean(style.boxShadow && style.boxShadow !== "none");
      }

      const el = document.activeElement;
      if (
        !el ||
        el === document.body ||
        el === document.documentElement ||
        !(el instanceof HTMLElement)
      ) {
        return null;
      }
      if (!el.matches(":focus-visible")) return null;
      if (hasVisibleFocusIndicator(el)) return null;
      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      return {
        key: selectorOf(el),
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      };
    });
    if (!hit || seen.has(hit.key)) {
      if (step > 5 && seen.size > 0) break;
      continue;
    }
    seen.add(hit.key);
    nodes.push({ html: hit.html, target: [hit.selector] });
  }

  return nodes;
}

async function detectKeyboardTrap(
  page: Page,
): Promise<{ html: string; target: string[] } | null> {
  const focusableCount = await page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return document.querySelectorAll(selector).length;
  });
  if (focusableCount < 3) return null;

  const sequence: string[] = [];
  const maxSteps = Math.min(focusableCount * 2 + 5, MAX_TAB_STEPS);
  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press("Tab");
    const key = await page.evaluate(() => {
      function isIntentionalModalTrap(el: Element | null): boolean {
        if (!el) return false;
        return (
          el.closest('[aria-modal="true"]') !== null ||
          el.closest("dialog[open]") !== null
        );
      }

      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      if (isIntentionalModalTrap(el)) return "modal";
      const html = el as HTMLElement;
      if (html.id) return `#${html.id}`;
      return `${html.tagName.toLowerCase()}:${html.className}`;
    });
    sequence.push(key);
  }

  const tail = sequence.slice(-12);
  const unique = new Set(tail.filter((key) => key !== "body" && key !== "modal"));
  if (unique.size > 2) return null;
  if (tail.includes("modal")) return null;

  return page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      return role ? `${tag}[role="${role}"]` : tag;
    }

    function isIntentionalModalTrap(el: Element | null): boolean {
      if (!el) return false;
      return (
        el.closest('[aria-modal="true"]') !== null ||
        el.closest("dialog[open]") !== null
      );
    }

    const el = document.activeElement;
    if (!el || el === document.body || isIntentionalModalTrap(el)) return null;
    const html = el.outerHTML.replace(/\s+/g, " ").trim();
    return {
      html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
      selector: selectorOf(el),
    };
  }).then((trap) =>
    trap ? { html: trap.html, target: [trap.selector] } : null,
  );
}

async function collectFocusObscuredViolations(
  page: Page,
): Promise<Array<{ html: string; target: string[] }>> {
  const nodes: Array<{ html: string; target: string[] }> = [];
  const seen = new Set<string>();

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(() => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        return role ? `${tag}[role="${role}"]` : tag;
      }

      function isFocusObscured(el: Element): boolean {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top) return false;
        return top !== el && !el.contains(top) && !top.contains(el);
      }

      const el = document.activeElement;
      if (
        !el ||
        el === document.body ||
        el === document.documentElement ||
        !(el instanceof HTMLElement)
      ) {
        return null;
      }
      if (!el.matches(":focus-visible")) return null;
      if (!isFocusObscured(el)) return null;
      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      return {
        key: selectorOf(el),
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      };
    });
    if (!hit || seen.has(hit.key)) {
      if (step > 5 && seen.size > 0) break;
      continue;
    }
    seen.add(hit.key);
    nodes.push({ html: hit.html, target: [hit.selector] });
  }

  return nodes;
}
