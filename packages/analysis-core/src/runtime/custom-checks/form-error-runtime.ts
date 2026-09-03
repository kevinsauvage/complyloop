import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.js";

/**
 * Form validation flow — error association (§7 Forms / §20).
 *
 * The AST check `form-error-association` is a source heuristic (medium/low
 * confidence) that cannot see runtime/dynamic state. This rendered-DOM pass
 * inspects the page's *actual* invalid state and verifies the error is
 * programmatically associated with the field — the high-confidence counterpart,
 * same dual-path pattern as html-validate's `no-dup-id`.
 *
 * It only fires when a control is truly in an invalid state on the rendered
 * page (`aria-invalid="true"`), so it never flags a healthy form and has a
 * near-zero false-positive rate. Maps to `form-error-association`
 * (RGAA 11.10 · WCAG 3.3.1).
 */
export async function formErrorRuntimeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    const found: CustomViolationNode[] = [];
    const seen = new Set<string>();

    function selectorOf(el: Element): string {
      if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
      const name = el.getAttribute("name");
      if (name) return `[name="${name}"]`;
      return el.tagName.toLowerCase();
    }

    function snippetOf(el: Element): string {
      return (el.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 160);
    }

    function referencedErrorMessage(control: Element): Element | null {
      const describedBy = control.getAttribute("aria-describedby");
      if (!describedBy) return null;
      for (const id of describedBy.split(/\s+/)) {
        if (!id) continue;
        const target = document.getElementById(id);
        if (target && (target.textContent ?? "").trim().length > 0) {
          return target;
        }
      }
      return null;
    }

    document
      .querySelectorAll(
        'input:not([type="hidden"]), select, textarea, [role="textbox"], [role="combobox"]',
      )
      .forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const ariaInvalid = el.getAttribute("aria-invalid");
        // Only truly-invalid controls trigger this check.
        if (ariaInvalid !== "true" && ariaInvalid !== "") return;

        const associated = referencedErrorMessage(el);
        if (associated) return;

        const sel = selectorOf(el);
        if (seen.has(sel)) return;
        seen.add(sel);
        found.push({
          html: snippetOf(el),
          target: [sel],
          elementLabel: "invalid form control",
          failureSummary:
            "The control is marked aria-invalid but has no error message associated via aria-describedby, so a screen reader user cannot tell what is wrong.",
        });
      });

    return found;
  });

  if (nodes.length === 0) return null;

  return {
    id: "complyloop-form-error-association",
    impact: "serious",
    description:
      "A form control in an invalid state has no programmatically associated error message.",
    help: "Error messages must be programmatically associated with the field they describe (RGAA 11.10 / WCAG 3.3.1).",
    nodes,
  };
}