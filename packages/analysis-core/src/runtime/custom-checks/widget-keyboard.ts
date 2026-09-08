import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import {
  isKeyboardFocusable,
  selectorOf,
  type SelectorRef,
} from "./widget-keyboard-utils.ts";

/**
 * ARIA widget keyboard reachability (§7 Interaction: tabs, disclosure, menu).
 *
 * These checks verify that composite widgets are reachable in the tab order.
 * They do not simulate arrow-key operability inside the widget.
 */

const BROWSER_HELPERS = `(function helperSource() {
  ${isKeyboardFocusable.toString()}
  function snippetOf(el) {
    return (el.outerHTML || "").replace(/\\s+/g, " ").trim().slice(0, 160);
  }
  return { snippetOf: snippetOf, isKeyboardFocusable: isKeyboardFocusable };
})()`;

type WidgetHit = SelectorRef & {
  html: string;
  elementLabel: string;
  failureSummary: string;
};

function toNodes(hits: WidgetHit[]): CustomViolationNode[] {
  return hits.map((hit) => ({
    html: hit.html,
    target: [selectorOf(hit)],
    elementLabel: hit.elementLabel,
    failureSummary: hit.failureSummary,
  }));
}

export async function widgetKeyboardViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const violations: CustomViolation[] = [];

  const tabNodes = toNodes(await collectTablistHits(page));
  if (tabNodes.length > 0) {
    violations.push({
      id: "tabs-keyboard",
      impact: "serious",
      description:
        "A tablist has no tab in the keyboard tab order.",
      help: "At least one tab must be in the keyboard tab order so the widget is reachable (RGAA 7.3 / WCAG 2.1.1). Arrow-key navigation inside the tablist is not verified by this check.",
      nodes: tabNodes,
    });
  }

  const disclosureNodes = toNodes(await collectDisclosureHits(page));
  if (disclosureNodes.length > 0) {
    violations.push({
      id: "disclosure-keyboard",
      impact: "serious",
      description:
        "An aria-expanded toggle is not keyboard-activatable.",
      help: "A control that expands/collapses content must itself be focusable and operable from the keyboard (RGAA 7.3 / WCAG 2.1.1).",
      nodes: disclosureNodes,
    });
  }

  const menuNodes = toNodes(await collectMenuHits(page));
  if (menuNodes.length > 0) {
    violations.push({
      id: "menu-keyboard",
      impact: "serious",
      description:
        "Menu items are not reachable with a keyboard.",
      help: "Menu items must be focusable so a keyboard user can navigate the menu (RGAA 7.3 / WCAG 2.1.1).",
      nodes: menuNodes,
    });
  }

  return violations;
}

async function collectTablistHits(page: Page): Promise<WidgetHit[]> {
  return page.evaluate((helperSrc) => {
    const { snippetOf, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      snippetOf: (el: Element) => string;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const found: WidgetHit[] = [];
    const seen = new Set<string>();

    document.querySelectorAll('[role="tablist"]').forEach((list) => {
      const tabs = Array.from(
        list.querySelectorAll(':scope [role="tab"]'),
      );
      if (tabs.length === 0) return;

      const focusable = tabs.filter((tab) => isKeyboardFocusable(tab));
      if (focusable.length > 0) return;

      const key = `${list.id}\0${list.getAttribute("role") ?? ""}\0${list.tagName}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        html: snippetOf(list),
        id: list.id,
        role: list.getAttribute("role"),
        tagName: list.tagName,
        elementLabel: "tablist",
        failureSummary:
          "None of the tabs participate in the tab order, so the widget cannot be reached or operated with a keyboard.",
      });
    });

    return found;
  }, BROWSER_HELPERS);
}

async function collectDisclosureHits(page: Page): Promise<WidgetHit[]> {
  return page.evaluate((helperSrc) => {
    const { snippetOf, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      snippetOf: (el: Element) => string;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const found: WidgetHit[] = [];
    const seen = new Set<string>();

    document.querySelectorAll("[aria-expanded]").forEach((el) => {
      if (isKeyboardFocusable(el)) return;
      const hasControls = Boolean(el.getAttribute("aria-controls"));
      if (!hasControls) return;

      const key = `${el.id}\0${el.getAttribute("role") ?? ""}\0${el.tagName}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        html: snippetOf(el),
        id: el.id,
        role: el.getAttribute("role"),
        tagName: el.tagName,
        elementLabel: "aria-expanded toggle",
        failureSummary:
          "The element manages an expanded/contracted relationship but is not focusable and has no button/combobox/link role, so a keyboard user cannot toggle it.",
      });
    });

    return found;
  }, BROWSER_HELPERS);
}

async function collectMenuHits(page: Page): Promise<WidgetHit[]> {
  return page.evaluate((helperSrc) => {
    const { snippetOf, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      snippetOf: (el: Element) => string;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const found: WidgetHit[] = [];
    const seen = new Set<string>();

    document
      .querySelectorAll(
        '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitemradio"], [role="menubar"] [role="menuitem"]',
      )
      .forEach((el) => {
        if (isKeyboardFocusable(el)) return;
        if (el.closest('[aria-hidden="true"]')) return;

        const key = `${el.id}\0${el.getAttribute("role") ?? ""}\0${el.tagName}`;
        if (seen.has(key)) return;
        seen.add(key);
        found.push({
          html: snippetOf(el),
          id: el.id,
          role: el.getAttribute("role"),
          tagName: el.tagName,
          elementLabel: "menu item",
          failureSummary:
            "This menu item is not keyboard-focusable, so a keyboard user cannot reach it with Tab.",
        });
      });

    return found;
  }, BROWSER_HELPERS);
}
