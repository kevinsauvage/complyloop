import type { Page } from "playwright";
import type { CustomViolation } from "./types";

export async function mediaAtCompatibleViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function accessibleName(el: Element): string {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ")
          .trim();
      }
      return (
        el.getAttribute("aria-label")?.trim() ??
        el.getAttribute("title")?.trim() ??
        ""
      );
    }

    function unlabeledControl(el: Element): Element | null {
      const buttons = el.querySelectorAll(
        'button, [role="button"], input[type="button"], input[type="submit"]',
      );
      for (const button of buttons) {
        const name =
          accessibleName(button) || (button.textContent?.trim() ?? "");
        if (!name) return button;
      }
      return null;
    }

    for (const media of document.querySelectorAll("video, audio")) {
      if (!(media instanceof HTMLMediaElement)) continue;
      if (media.hasAttribute("controls")) continue;

      const playerRoot =
        media.closest('[role="application"]') ??
        media.parentElement ??
        media;
      const playerName =
        accessibleName(media) || accessibleName(playerRoot);
      if (!playerName) {
        const html = playerRoot.outerHTML.replace(/\s+/g, " ").trim();
        return {
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(playerRoot),
          reason: "no_player_name" as const,
        };
      }

      const badControl = unlabeledControl(playerRoot);
      if (badControl) {
        const html = badControl.outerHTML.replace(/\s+/g, " ").trim();
        return {
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(badControl),
          reason: "unlabeled_control" as const,
        };
      }
    }

    return null;
  });

  if (!hit) return null;

  const description =
    hit.reason === "no_player_name"
      ? "Custom media player has no accessible name for assistive technology."
      : "Custom media player control has no accessible name.";

  return {
    id: "complyloop-media-at-compatible",
    impact: "serious",
    description,
    help: "Give the player and its controls aria-label or visible text so name, role, and value are exposed (WCAG 4.1.2 / RGAA 4.13).",
    nodes: [{ html: hit.html, target: [hit.selector] }],
  };
}
