import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

export async function mediaKeyboardViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    const media = document.querySelector("video[controls], audio[controls]");
    if (!(media instanceof HTMLMediaElement)) return null;
    if (media.readyState < 1) return null;

    media.focus();
    const focused = document.activeElement === media;
    if (!focused) {
      const html = media.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(media),
        reason: "not_focusable",
      };
    }

    const wasPaused = media.paused;
    media.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
    media.dispatchEvent(
      new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }),
    );

    if (media.paused === wasPaused) {
      const html = media.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(media),
        reason: "space_ignored",
      };
    }

    if (!wasPaused) media.pause();
    else void media.play();
    return null;
  });

  if (!hit) return null;

  const detail =
    hit.reason === "not_focusable"
      ? "Native media controls are not keyboard-focusable."
      : "Native media controls did not respond to the Space key.";

  return {
    id: "complyloop-media-keyboard",
    impact: "serious",
    description: detail,
    help: "Ensure <video controls> and <audio controls> can be focused and operated with the keyboard (WCAG 2.1.1 / RGAA 4.11).",
    nodes: [{ html: hit.html, target: [hit.selector] }],
  };
}
