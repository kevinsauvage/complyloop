import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.js";

const MAX_TRIGGERS = 8;
const CONTENT_DELTA = 8;

/**
 * WCAG 1.4.13 — content shown on hover must be dismissible with Escape and
 * have a keyboard-equivalent reveal path.
 */
export async function hoverContentViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const triggers = page.locator(
    "[title], [data-tooltip], [aria-haspopup='true']",
  );
  const count = Math.min(await triggers.count(), MAX_TRIGGERS);
  const nodes: CustomViolationNode[] = [];

  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible())) continue;

    const beforeLen = await page.evaluate(() => document.body.innerText.length);
    await trigger.hover();
    await page.waitForTimeout(120);
    const hoverLen = await page.evaluate(() => document.body.innerText.length);
    if (hoverLen <= beforeLen + CONTENT_DELTA) {
      await page.mouse.move(0, 0);
      continue;
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    const afterEscapeLen = await page.evaluate(() => document.body.innerText.length);
    const escapeDismisses = afterEscapeLen <= beforeLen + CONTENT_DELTA;

    await trigger.focus();
    await page.waitForTimeout(120);
    const focusLen = await page.evaluate(() => document.body.innerText.length);
    const focusReveals = focusLen > beforeLen + CONTENT_DELTA;

    await page.mouse.move(0, 0);

    const failures: string[] = [];
    if (!escapeDismisses) {
      failures.push("Escape does not dismiss the hover-revealed content.");
    }
    if (!focusReveals) {
      failures.push("Keyboard focus does not reveal equivalent content.");
    }
    if (failures.length === 0) continue;

    const html = (await trigger.evaluate((el) => el.outerHTML)).replace(/\s+/g, " ");
    const selector = await trigger.evaluate((el) =>
      el.id ? `#${el.id}` : el.tagName.toLowerCase(),
    );
    nodes.push({
      html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
      target: [selector],
      failureSummary: failures.join(" "),
    });
    if (nodes.length >= 5) break;
  }

  if (nodes.length === 0) return null;

  return {
    id: "complyloop-hover-content",
    impact: "moderate",
    description:
      "Extra content shown on hover is not dismissible with Escape or lacks a keyboard-equivalent reveal path.",
    help: "WCAG 1.4.13: hover/focus content must be dismissible, hoverable, and keyboard reachable (RGAA 10.13).",
    nodes,
  };
}
