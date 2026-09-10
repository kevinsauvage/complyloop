import type { Page } from "playwright";

import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import {
  isKeyboardFocusable,
  selectorOf,
} from "./widget-keyboard-utils.ts";

/**
 * ARIA widget keyboard reachability (§7 Interaction: tabs, disclosure, menu).
 *
 * These checks verify that composite widgets are reachable in the tab order.
 * They do not simulate arrow-key operability inside the widget.
 */

const BROWSER_HELPERS = `(function helperSource() {
  const hit = (${BROWSER_HIT_CAPTURE_SRC});
  ${isKeyboardFocusable.toString()}
  return { captureHit: hit.captureHit, isKeyboardFocusable };
})()`;

type WidgetHit = CapturedHit & {
  elementLabel: string;
  failureSummary: string;
};

type WidgetHelpers = {
  captureHit: (el: Element) => CapturedHit;
  isKeyboardFocusable: (el: Element) => boolean;
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

  const tabNodes = toNodes(
    await collectWidgetHits(
      page,
      '[role="tablist"]',
      tablistIsViolation.toString(),
      "tablist",
      "None of the tabs participate in the tab order, so the widget cannot be reached or operated with a keyboard.",
    ),
  );
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

  const disclosureNodes = toNodes(
    await collectWidgetHits(
      page,
      "[aria-expanded]",
      disclosureIsViolation.toString(),
      "aria-expanded toggle",
      "The element manages an expanded/contracted relationship but is not focusable and has no button/combobox/link role, so a keyboard user cannot toggle it.",
    ),
  );
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

  const menuNodes = toNodes(
    await collectWidgetHits(
      page,
      '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitemradio"], [role="menubar"] [role="menuitem"]',
      menuIsViolation.toString(),
      "menu item",
      "This menu item is not keyboard-focusable, so a keyboard user cannot reach it with Tab.",
    ),
  );
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

function tablistIsViolation(
  el: Element,
  { isKeyboardFocusable }: WidgetHelpers,
): boolean {
  const tabs = Array.from(el.querySelectorAll(':scope [role="tab"]'));
  if (tabs.length === 0) return false;
  return tabs.every((tab) => !isKeyboardFocusable(tab));
}

function disclosureIsViolation(
  el: Element,
  { isKeyboardFocusable }: WidgetHelpers,
): boolean {
  if (isKeyboardFocusable(el)) return false;
  return Boolean(el.getAttribute("aria-controls"));
}

function menuIsViolation(
  el: Element,
  { isKeyboardFocusable }: WidgetHelpers,
): boolean {
  if (isKeyboardFocusable(el)) return false;
  return !el.closest('[aria-hidden="true"]');
}

async function collectWidgetHits(
  page: Page,
  selector: string,
  isViolationSrc: string,
  elementLabel: string,
  failureSummary: string,
): Promise<WidgetHit[]> {
  return page.evaluate(
    ({ helperSrc, selector, isViolationSrc, elementLabel, failureSummary }) => {
      const helpers = new Function(`return (${helperSrc})`)() as WidgetHelpers;
      const isViolation = new Function(`return (${isViolationSrc})`)() as (
        el: Element,
        helpers: WidgetHelpers,
      ) => boolean;

      const found: WidgetHit[] = [];
      const seen = new Set<string>();

      document.querySelectorAll(selector).forEach((el) => {
        if (!isViolation(el, helpers)) return;

        const key = `${el.id}\0${el.getAttribute("role") ?? ""}\0${el.tagName}`;
        if (seen.has(key)) return;
        seen.add(key);
        const hit = helpers.captureHit(el);
        found.push({
          ...hit,
          elementLabel,
          failureSummary,
        });
      });

      return found;
    },
    {
      helperSrc: BROWSER_HELPERS,
      selector,
      isViolationSrc,
      elementLabel,
      failureSummary,
    },
  );
}
