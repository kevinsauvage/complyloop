import type { CheckId } from "@/analysis/types";

export interface CheckGuidance {
  impact: string;
  howToFix: string;
}

const guidance: Record<CheckId, CheckGuidance> = {
  "img-alt": {
    impact:
      "Screen reader users hear nothing, or a raw file name, where sighted users see meaningful content. Informative images become invisible to them.",
    howToFix:
      'Add an alt attribute that describes the image\u2019s purpose in context. Use alt="" only for purely decorative images.',
  },
  "button-name": {
    impact:
      "Screen reader users hear only \u201cbutton\u201d and cannot tell what pressing it will do, which can block them from completing the task entirely.",
    howToFix:
      "Give the button visible text, or an aria-label describing the action when the button is icon-only.",
  },
  "anchor-name": {
    impact:
      "Screen reader users navigating by links hear an empty entry and cannot tell where the link leads.",
    howToFix:
      "Give the link text content, an image child with a descriptive alt, or an aria-label describing the destination.",
  },
  "html-lang": {
    impact:
      "Screen readers pick pronunciation rules from the declared page language; without it, content can be read with the wrong voice and become hard to understand.",
    howToFix:
      'Add a lang attribute to the <html> element matching the page\u2019s main language, e.g. lang="fr" or lang="en".',
  },
  "positive-tabindex": {
    impact:
      "A positive tabindex hijacks the tab order: keyboard users jump to this element before everything else, then land back in an unpredictable position.",
    howToFix:
      "Remove the positive value. Use tabIndex={0} to include an element in the natural order, or tabIndex={-1} to make it focusable only programmatically.",
  },
  "input-label": {
    impact:
      "Users of assistive technologies land in the field without knowing what to enter; voice-control users cannot target the field by name.",
    howToFix:
      "Associate a <label htmlFor> with the input\u2019s id, or add aria-label / aria-labelledby when a visible label is not possible.",
  },
  "heading-order": {
    impact:
      "Skipped heading levels break the document outline that screen reader users rely on to navigate by section.",
    howToFix:
      "Use consecutive heading levels (h1 → h2 → h3). Do not jump from h2 to h4.",
  },
  "empty-heading": {
    impact:
      "Empty headings appear in the outline with no label, confusing screen reader navigation.",
    howToFix:
      "Put descriptive text inside the heading, or provide aria-label when the visible text is elsewhere.",
  },
  "iframe-title": {
    impact:
      "Without a title, assistive technologies announce only \u201cframe\u201d with no context for the embedded content.",
    howToFix:
      'Add title="…" describing the iframe\u2019s purpose (e.g. title="Payment form").',
  },
  "autoplay-media": {
    impact:
      "Autoplaying audio/video interrupts screen readers, surprises users, and can violate motion or sound preferences.",
    howToFix:
      "Remove autoPlay. Let users start playback with an explicit control.",
  },
};

export function guidanceFor(checkId: string): CheckGuidance | undefined {
  return (guidance as Record<string, CheckGuidance>)[checkId];
}
