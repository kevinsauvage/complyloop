import type { Page } from "playwright";

import { pageEvaluateWithHitCapture, toViolationNodes } from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";

export async function mediaKeyboardViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await pageEvaluateWithHitCapture(page, (captureHit) => {
    const media = document.querySelector("video[controls], audio[controls]");
    if (!(media instanceof HTMLMediaElement)) return null;
    if (media.readyState < 1) return null;

    media.focus();
    const focused = document.activeElement === media;
    if (!focused) {
      const captured = captureHit(media);
      return {
        html: captured.html,
        id: captured.id,
        role: captured.role,
        tagName: captured.tagName,
        reason: "not_focusable" as const,
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
      const captured = captureHit(media);
      return {
        html: captured.html,
        id: captured.id,
        role: captured.role,
        tagName: captured.tagName,
        reason: "space_ignored" as const,
      };
    }

    // Restore the pre-probe play state: a paused media that Space started
    // must be paused again, and vice versa.
    if (wasPaused) media.pause();
    else void media.play();
    return null;
  });

  if (!hit) return null;

  const detail =
    hit.reason === "not_focusable"
      ? "Native media controls are not keyboard-focusable."
      : "Native media controls did not respond to the Space key.";

  return {
    id: "media-keyboard",
    impact: "serious",
    description: detail,
    help: "Ensure <video controls> and <audio controls> can be focused and operated with the keyboard (WCAG 2.1.1 / RGAA 4.11).",
    nodes: toViolationNodes([hit]),
  };
}
