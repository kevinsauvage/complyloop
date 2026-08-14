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
      "Skipped heading levels break the document outline that screen reader users rely on to navigate by section. Jumping from h2 to h4 hides the missing h3 as a landmark.",
    howToFix:
      "Rework the outline so levels increase by one (h1 → h2 → h3). Prefer changing the skipped heading\u2019s level rather than inserting empty headings. Do not auto-renumber mechanically — structure must match the page\u2019s real sections.",
  },
  "empty-heading": {
    impact:
      "Empty headings appear in the outline with no label, so screen reader users hear \u201cheading level N\u201d with nothing to identify the section.",
    howToFix:
      "Put concise, descriptive text inside the heading that names the section. If the visible title lives elsewhere, keep that text and add aria-label on the heading that matches it — never leave an empty <h*>. Removing the heading is correct only when the section should not be in the outline.",
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
      "Remove the autoPlay attribute and provide visible play controls (controls is fine). Users must start playback themselves.",
  },
  "duplicate-id": {
    impact:
      "Duplicate IDs break label associations, aria-labelledby / aria-describedby targets, and in-page links — assistive tech may announce the wrong element.",
    howToFix:
      "Give each element a unique id within the document (and within this file as a minimum). Prefer generated ids for lists/maps.",
  },
  "form-error-association": {
    impact:
      "When an error is not linked to its field, screen reader users may not hear why the form failed or which value to fix.",
    howToFix:
      "Put the error text in an element with an id, set aria-describedby on the invalid field to that id, and keep aria-invalid=\"true\" while the error applies.",
  },
  "aria-hidden-focusable": {
    impact:
      "Keyboard users can focus an element that assistive technologies skip, creating a silent focus trap or dead control.",
    howToFix:
      "Remove aria-hidden from focusable elements, or remove them from the tab order (tabIndex={-1} / disabled / inert) when they must stay visually hidden.",
  },
  "aria-role": {
    impact:
      "An invalid or abstract role is ignored or misinterpreted, so the control's name, state, and keyboard behavior never reach assistive technologies.",
    howToFix:
      "Use a concrete ARIA role from the spec (button, checkbox, dialog, …). Do not invent names or use abstract roles like widget or command.",
  },
  "aria-props": {
    impact:
      "Unknown aria-* attributes are ignored. The intended name, state, or relationship never reaches the accessibility tree.",
    howToFix:
      "Replace the typo with a real ARIA property (aria-label, aria-expanded, …). Remove attributes that are not in the specification.",
  },
  "aria-required-attr": {
    impact:
      "A role without its required properties exposes an incomplete control — screen readers omit checked state, expand/collapse, or value.",
    howToFix:
      "Add every property the role requires (checkbox → aria-checked, combobox → aria-controls and aria-expanded, slider → aria-valuenow).",
  },
  "no-autofocus": {
    impact:
      "Focus jumping to an unexpected field on load disorients keyboard and screen reader users and can skip page context.",
    howToFix:
      "Remove autoFocus. Let the user tab to the field, or move focus only after an explicit user action (opening a dialog).",
  },
  "keyboard-interaction": {
    impact:
      "Pointer-only handlers leave keyboard users unable to activate the control or perceive hover-only information.",
    howToFix:
      "Prefer a native <button> or <a href>. If you must use a non-native host, add an interactive role, tabIndex={0}, and keyboard equivalents (onKeyDown / onFocus / onBlur).",
  },
  "color-contrast": {
    impact:
      "Low-contrast text is unreadable for users with low vision and in bright environments; this can only be measured on the rendered page.",
    howToFix:
      "Raise the contrast between text and background to at least 4.5:1 (3:1 for large text). Check computed colors, not source tokens.",
  },
  "document-title": {
    impact:
      "Without a title, browser tabs and screen reader page lists are indistinguishable, so users cannot tell where they are.",
    howToFix:
      "Give every route a unique, descriptive <title> (Next.js: export metadata.title or a <title> in the document).",
  },
  bypass: {
    impact:
      "Keyboard users must tab through every repeated header/nav link on every page before reaching the content.",
    howToFix:
      "Provide a skip link to main content, or expose landmarks/headings that let users jump past repeated chrome.",
  },
  "landmark-one-main": {
    impact:
      "Missing or multiple main landmarks make it unclear where the primary content starts for landmark navigation.",
    howToFix:
      "Wrap the primary content in a single <main> (or role=\"main\") per page.",
  },
  "nested-interactive": {
    impact:
      "A control inside another control produces conflicting names and activation; assistive technologies announce an unusable composite.",
    howToFix:
      "Do not put a <button> or <a> inside another widget. Restructure so each interactive element is a sibling, not a descendant.",
  },
  "target-size": {
    impact:
      "Tiny click/tap targets are easy to miss, especially for motor impairments and touch users.",
    howToFix:
      "Make the clickable area at least 24×24 CSS pixels, or add sufficient spacing from adjacent targets.",
  },
};

export function guidanceFor(checkId: CheckId): CheckGuidance {
  return guidance[checkId];
}
