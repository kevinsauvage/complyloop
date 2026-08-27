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
  "meta-viewport": {
    impact:
      "Users with low vision cannot enlarge the page when the viewport meta disables zoom.",
    howToFix:
      'Remove user-scalable=no and set maximum-scale to at least 2 (or omit it). Prefer content="width=device-width, initial-scale=1".',
  },
  "list-structure": {
    impact:
      "Broken list markup hides the list semantics from screen readers, so items are announced as ordinary text.",
    howToFix:
      "Use <ul>/<ol>/<menu> with <li> children only. Do not place <div> or other elements as direct list children, and do not use orphan <li> outside a list.",
  },
  "autocomplete-valid": {
    impact:
      "Invalid autocomplete tokens prevent browsers and assistive technologies from identifying the purpose of a field (WCAG 1.3.5).",
    howToFix:
      'Use a valid HTML autofill token (e.g. autocomplete="email" or "shipping street-address"). Prefer "off" only when autofill is intentionally disabled.',
  },
  "table-headers": {
    impact:
      "Without header associations, screen reader users cannot trace which row/column a data cell belongs to, so tabular data becomes meaningless.",
    howToFix:
      "Mark header cells with <th scope=\"col|row\"> or associate cells via headers/id. Avoid presentation-only tables built from <div>s for real data.",
  },
  "page-heading": {
    impact:
      "A page with no top-level heading gives screen reader and navigation users no clear starting point for its content (WCAG 2.4.6).",
    howToFix:
      "Add a single descriptive <h1> that names the page or main section. Do not use a styled <div> or image where a real heading is expected.",
  },
  "content-region": {
    impact:
      "Content outside landmarks is invisible to landmark navigation, so assistive technology users cannot skip to the relevant region (WCAG 1.3.1).",
    howToFix:
      "Wrap distinct sections in semantic landmarks: <header>, <nav>, <main>, <aside>, <footer>, or role equivalents. Keep all content inside a landmark.",
  },
  "label-in-name": {
    impact:
      "When the accessible name omits the visible label, speech-input users cannot activate the control by saying what they see (WCAG 2.5.3).",
    howToFix:
      "Ensure the accessible name includes the visible text label. Prefer a real <label>, or set aria-label/aria-labelledby to start with the visible label text.",
  },
  "lang-parts": {
    impact:
      "A passage in another language is read with the wrong pronunciation rules, making it hard to understand for screen reader users (WCAG 3.1.2).",
    howToFix:
      'Add a lang attribute to the element wrapping the foreign-language passage, e.g. <span lang="es">…</span>.',
  },
  "aria-roledescription": {
    impact:
      "An empty or vague aria-roledescription gives assistive technologies a meaningless role name in place of the real one (WCAG 4.1.2).",
    howToFix:
      "Provide a non-empty, concise roledescription that adds meaning; never leave it empty, and do not duplicate the implicit role name.",
  },
  "presentation-role": {
    impact:
      "A focusable element inside role='presentation'/'none' is removed from the accessibility tree but still focusable, creating a silent, unusable control (WCAG 4.1.2).",
    howToFix:
      "Move focusable descendants out of the presentation element, or mark them inert/tabIndex={-1} when they must stay visually present.",
  },
  "no-auto-refresh": {
    impact:
      "An unexpected auto-refresh or redirect can move users without warning, interrupting screen readers and losing their place (WCAG 2.2.1).",
    howToFix:
      'Remove <meta http-equiv="refresh"> redirects. If a refresh is essential, warn the user and let them extend or disable it.',
  },
  "no-orientation-lock": {
    impact:
      "Locking content to one orientation traps users on devices they cannot rotate (e.g. mounted tablets, fixed stands) and breaks their experience (WCAG 1.3.4).",
    howToFix:
      "Remove CSS that forces orientation, such as @media (orientation: portrait) to hide content or transform: rotate. Let the layout adapt to both orientations unless the content is genuinely orientation-dependent.",
  },
  "landmark-unique": {
    impact:
      "When two landmarks of the same type share a name, assistive technology users cannot distinguish them in landmark navigation (WCAG 1.3.1).",
    howToFix:
      "Give each repeated landmark a distinct accessible name, e.g. <nav aria-label=\"Primary\"> and <nav aria-label=\"Footer\">, or use different landmark types.",
  },
  "pointer-gesture": {
    impact:
      "When an action only works through a drag/track path, keyboard and switch users cannot perform it at all (WCAG 2.5.1).",
    howToFix:
      "Add a single-pointer or keyboard equivalent: a button, a native <input type=\"range\">, or an onKeyDown handler that performs the same action.",
  },
  "pointer-cancellation": {
    impact:
      "If a press cannot be aborted, users who start an action by mistake commit it before they can cancel, causing accidental changes (WCAG 2.5.2).",
    howToFix:
      "Handle pointercancel/pointerup so the action completes only on release, and let moving the pointer away abort it. Avoid performing the action on pointerdown alone.",
  },
  "motion-actuation": {
    impact:
      "Functions tied to device motion/orientation exclude users who cannot perform the physical motion (WCAG 2.5.4).",
    howToFix:
      "Provide a button or keyboard control that triggers the same function, and do not require shaking or tilting the device.",
  },
  "focus-context-change": {
    impact:
      "Unexpected context changes on focus disorient screen reader and keyboard users, who may lose their place (WCAG 3.2.1).",
    howToFix:
      "Do not navigate or submit from onFocus. Move navigation to an explicit action (click/Enter) or warn the user first.",
  },
  "input-context-change": {
    impact:
      "Unexpected context changes on input can interrupt the user mid-task and is especially harmful for assistive-technology users (WCAG 3.2.2).",
    howToFix:
      "Defer navigation/submission until an explicit submit, or confirm with the user before changing context on input.",
  },
  "sensory-characteristics": {
    impact:
      "Instructions that say \"click the red button\" or \"use the box on the left\" fail anyone who cannot perceive color or position (WCAG 1.3.3).",
    howToFix:
      "Repeat the instruction in text that does not depend on color, shape, size, location, or sound (e.g. name the control explicitly).",
  },
  "image-of-text": {
    impact:
      "Text rendered as an image cannot be resized, recolored, or read by assistive technology, and is lost when zoomed (WCAG 1.4.5).",
    howToFix:
      "Replace background-image or role='img' text with real HTML text styled with CSS, so users can adapt it.",
  },
  "error-suggestion": {
    impact:
      "An error that only says \"invalid\" leaves the user guessing how to fix it, increasing failed submissions (WCAG 3.3.3).",
    howToFix:
      "Include a corrective hint, e.g. \"Email is required and must look like name@example.com.\"",
  },
};

export function guidanceFor(checkId: CheckId): CheckGuidance {
  return guidance[checkId];
}
