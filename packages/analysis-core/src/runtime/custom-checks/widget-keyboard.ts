import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import { isKeyboardFocusable, selectorOf } from "./widget-keyboard-utils.ts";

/**
 * ARIA widget keyboard reachability (§7 Interaction: tabs, disclosure, menu).
 *
 * These checks verify that composite widgets are reachable in the tab order.
 * They do not simulate arrow-key operability inside the widget.
 */

const BROWSER_HELPERS = `(function helperSource() {
  ${selectorOf.toString()}
  ${isKeyboardFocusable.toString()}
  function snippetOf(el) {
    return (el.outerHTML || "").replace(/\\s+/g, " ").trim().slice(0, 160);
  }
  return { selectorOf: selectorOf, snippetOf: snippetOf, isKeyboardFocusable: isKeyboardFocusable };
})()`;

export async function widgetKeyboardViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const violations: CustomViolation[] = [];

  const tabNodes = await collectTablistNodes(page);
  if (tabNodes.length > 0) {
    violations.push({
      id: "complyloop-tabs-keyboard",
      impact: "serious",
      description:
        "A tablist has no tab in the keyboard tab order.",
      help: "At least one tab must be in the keyboard tab order so the widget is reachable (RGAA 7.3 / WCAG 2.1.1). Arrow-key navigation inside the tablist is not verified by this check.",
      nodes: tabNodes,
    });
  }

  const disclosureNodes = await collectDisclosureNodes(page);
  if (disclosureNodes.length > 0) {
    violations.push({
      id: "complyloop-disclosure-keyboard",
      impact: "serious",
      description:
        "An aria-expanded toggle is not keyboard-activatable.",
      help: "A control that expands/collapses content must itself be focusable and operable from the keyboard (RGAA 7.3 / WCAG 2.1.1).",
      nodes: disclosureNodes,
    });
  }

  const menuNodes = await collectMenuNodes(page);
  if (menuNodes.length > 0) {
    violations.push({
      id: "complyloop-menu-keyboard",
      impact: "serious",
      description:
        "Menu items are not reachable with a keyboard.",
      help: "Menu items must be focusable so a keyboard user can navigate the menu (RGAA 7.3 / WCAG 2.1.1).",
      nodes: menuNodes,
    });
  }

  return violations;
}

async function collectTablistNodes(page: Page): Promise<CustomViolationNode[]> {
  return page.evaluate((helperSrc) => {
    const { selectorOf, snippetOf, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      selectorOf: (el: Element) => string;
      snippetOf: (el: Element) => string;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const found: CustomViolationNode[] = [];
    const seen = new Set<string>();

    document.querySelectorAll('[role="tablist"]').forEach((list) => {
      const tabs = Array.from(
        list.querySelectorAll(':scope [role="tab"]'),
      );
      if (tabs.length === 0) return;

      const focusable = tabs.filter((tab) => isKeyboardFocusable(tab));
      if (focusable.length > 0) return;

      const sel = selectorOf(list);
      if (seen.has(sel)) return;
      seen.add(sel);
      found.push({
        html: snippetOf(list),
        target: [sel],
        elementLabel: "tablist",
        failureSummary:
          "None of the tabs participate in the tab order, so the widget cannot be reached or operated with a keyboard.",
      });
    });

    return found;
  }, BROWSER_HELPERS);
}

async function collectDisclosureNodes(
  page: Page,
): Promise<CustomViolationNode[]> {
  return page.evaluate((helperSrc) => {
    const { selectorOf, snippetOf, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      selectorOf: (el: Element) => string;
      snippetOf: (el: Element) => string;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const found: CustomViolationNode[] = [];
    const seen = new Set<string>();

    document.querySelectorAll('[aria-expanded]').forEach((el) => {
      if (isKeyboardFocusable(el)) return;
      // aria-expanded on a container that is not itself the control (e.g. a
      // listbox group) is legitimate; only flag obvious widget-shaped toggles
      // a user has no keyboard path to.
      const hasControls = Boolean(el.getAttribute("aria-controls"));
      if (!hasControls) return;

      const sel = selectorOf(el);
      if (seen.has(sel)) return;
      seen.add(sel);
      found.push({
        html: snippetOf(el),
        target: [sel],
        elementLabel: "aria-expanded toggle",
        failureSummary:
          "The element manages an expanded/contracted relationship but is not focusable and has no button/combobox/link role, so a keyboard user cannot toggle it.",
      });
    });

    return found;
  }, BROWSER_HELPERS);
}

async function collectMenuNodes(page: Page): Promise<CustomViolationNode[]> {
  return page.evaluate((helperSrc) => {
    const { selectorOf, snippetOf, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      selectorOf: (el: Element) => string;
      snippetOf: (el: Element) => string;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const found: CustomViolationNode[] = [];
    const seen = new Set<string>();

    document
      .querySelectorAll(
        '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitemradio"], [role="menubar"] [role="menuitem"]',
      )
      .forEach((el) => {
        if (isKeyboardFocusable(el)) return;
        // Items guarded by aria-hidden (e.g. disabled submenus) are expected.
        if (el.closest('[aria-hidden="true"]')) return;

        const sel = selectorOf(el);
        if (seen.has(sel)) return;
        seen.add(sel);
        found.push({
          html: snippetOf(el),
          target: [sel],
          elementLabel: "menu item",
          failureSummary:
            "This menu item is not keyboard-focusable, so a keyboard user cannot reach it with Tab.",
        });
      });

    return found;
  }, BROWSER_HELPERS);
}