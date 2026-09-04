import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.ts";

function node(sel: string, html: string, failureSummary: string): CustomViolationNode {
  return { html, target: [sel], elementLabel: sel, failureSummary };
}

/**
 * Dialog focus management (§17 Dialogs).
 *
 * A modal/accessible dialog must: (1) move focus into itself on open, (2)
 * contain Tab focus while open (the trap belongs here only when the dialog is
 * NOT closed by the open intent — i.e. a modal that leaks focus), and (3)
 * return focus to the trigger on close.
 *
 * We drive a real open→tab→Escape→close flow and compare focus before/after.
 * Maps to `keyboard-interaction` (focus movement/restoration) and
 * `keyboard-trap` (focus leaks out of an open modal).
 */
export async function dialogFocusViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const violations: CustomViolation[] = [];

  const findDialogs = await page.evaluate(() => {
    const sels: string[] = [];
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog').forEach((el) => {
      const e = el as HTMLElement;
      const open =
        e.tagName === "DIALOG"
          ? (e as unknown as { open: boolean }).open
          : !e.hidden && e.getAttribute("aria-hidden") !== "true";
      if (open) {
        const sel = e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}[role="${e.getAttribute("role") ?? "dialog"}"]`;
        if (!sels.includes(sel)) sels.push(sel);
      }
    });
    return sels;
  });

  if (findDialogs.length === 0) return [];

  for (const sel of findDialogs) {
    // Reset focus to the trigger/open button before each scenario where feasible.
    await page.evaluate((s) => {
      const d = document.querySelector(s) as HTMLElement | null;
      const trigger = d?.getAttribute("data-trigger");
      if (trigger) {
        const t = document.querySelector(trigger) as HTMLElement | null;
        t?.focus();
      }
    }, sel);

    // 1) Is focus inside the dialog?
    const inDialog = await page.evaluate((s) => {
      const d = document.querySelector(s);
      const a = document.activeElement;
      if (!d || !a) return false;
      return d.contains(a);
    }, sel);
    if (!inDialog) {
      violations.push({
        id: "dialog-keyboard",
        impact: "serious",
        description:
          "Opening the dialog did not move keyboard focus into it.",
        help: "When a dialog opens, focus must move into it so keyboard and screen-reader users can operate it (WCAG 2.4.3 / RGAA 7.3).",
        nodes: [node(sel, `<${sel.slice(1)} role="dialog">`, "Focus is not moved into the dialog on open.")],
      });
    }

    // 2) Modal trap: tabbing must stay inside an open modal.
    const isModal = await page.evaluate((s) => {
      const d = document.querySelector(s);
      return d?.getAttribute("aria-modal") === "true";
    }, sel);
    if (isModal) {
      // Ensure focus is inside the dialog before tabbing.
      if (!inDialog) {
        await page.evaluate((s) => {
          const d = document.querySelector(s);
          const first = d?.querySelector("input, button, a[href], [tabindex]:not([tabindex='-1'])") as HTMLElement | null;
          first?.focus();
        }, sel);
      }
      // Press Tab repeatedly; if focus ever lands outside the dialog, it leaks.
      let leaked = false;
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        leaked = await page.evaluate((s) => {
          const d = document.querySelector(s);
          const a = document.activeElement;
          return !!(d && a && a !== document.body && !d.contains(a));
        }, sel);
        if (leaked) break;
      }
      if (leaked) {
        violations.push({
          id: "keyboard-trap",
          impact: "critical",
          description:
            "Tab focus leaks out of an open modal dialog.",
          help: "A modal dialog must keep keyboard focus inside it while open (WCAG 2.1.2 / RGAA 12.9).",
          nodes: [node(sel, `<${sel.slice(1)} role="dialog" aria-modal="true">`, "Tab carried focus outside the modal while it is still open.")],
        });
      }
    }

    // 3) Focus restoration on close — only testable if a trigger is declared.
    const triggerSel = await page.evaluate((s) => {
      const d = document.querySelector(s);
      return d?.getAttribute("data-trigger") ?? null;
    }, sel);
    if (triggerSel) {
      await page.keyboard.press("Escape");
      const restored = await page.evaluate((t) => {
        const tr = document.querySelector(t);
        const a = document.activeElement;
        return !!(tr && a && (tr.contains(a) || tr === a));
      }, triggerSel);
      if (!restored) {
        violations.push({
          id: "dialog-keyboard",
          impact: "serious",
          description:
            "Closing the dialog did not return focus to the trigger.",
          help: "When a dialog closes, focus must return to the element that opened it (WCAG 2.4.3 / RGAA 7.3).",
          nodes: [node(triggerSel, `<${triggerSel.slice(1)}>`, "Focus was not returned to the dialog's trigger after close.")],
        });
      }
    }
  }

  return violations;
}
