import type { CheckId } from "@/analysis/types";
import type { CheckGuidance } from "@/adapters/types";

const guidance: Record<CheckId, CheckGuidance> = {
  "img-alt": {
    impact:
      "Screen reader users hear nothing, or a raw file name, where sighted users see meaningful content. Informative images become invisible to them.",
    howToFix:
      'Add an alt attribute that describes the image’s purpose in context. Use alt="" only for purely decorative images.',
  },
  "button-name": {
    impact:
      "Screen reader users hear only “button” and cannot tell what pressing it will do, which can block them from completing the task entirely.",
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
      'Add a lang attribute to the <html> element matching the page’s main language, e.g. lang="fr" or lang="en".',
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
      "Associate a <label htmlFor> with the input’s id, or add aria-label / aria-labelledby when a visible label is not possible.",
  },
  "heading-order": {
    impact:
      "Skipped heading levels break the document outline that screen reader users rely on to navigate by section. Jumping from h2 to h4 hides the missing h3 as a landmark.",
    howToFix:
      "Rework the outline so levels increase by one (h1 → h2 → h3). Prefer changing the skipped heading’s level rather than inserting empty headings. Do not auto-renumber mechanically — structure must match the page’s real sections.",
  },
  "empty-heading": {
    impact:
      "Empty headings appear in the outline with no label, so screen reader users hear “heading level N” with nothing to identify the section.",
    howToFix:
      "Put concise, descriptive text inside the heading that names the section. If the visible title lives elsewhere, keep that text and add aria-label on the heading that matches it — never leave an empty <h*>. Removing the heading is correct only when the section should not be in the outline.",
  },
  "iframe-title": {
    impact:
      "Without a title, assistive technologies announce only “frame” with no context for the embedded content.",
    howToFix:
      'Add title="…" describing the iframe’s purpose (e.g. title="Payment form").',
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
  "video-caption": {
    impact:
      "Deaf and hard-of-hearing users cannot follow speech, sound effects, or speaker changes in the video (WCAG 1.2.2 / RGAA 4.3).",
    howToFix:
      'Add a <track kind="captions"> (or kind="subtitles") pointing at a WebVTT file that matches the soundtrack.',
  },
  "audio-caption": {
    impact:
      "Users who cannot hear the audio have no equivalent for speech and important sounds (WCAG 1.2.1 / RGAA 4.1).",
    howToFix:
      'Provide a transcript on the page, or a <track kind="captions"> / kind="descriptions" on the audio element.',
  },
  "no-blink-marquee": {
    impact:
      "Moving or blinking content distracts users, interrupts screen readers, and can trigger vestibular disorders or seizures (WCAG 2.2.2 / RGAA 13.8).",
    howToFix:
      "Remove <marquee> and <blink>. If motion is needed, give a pause/stop control and honor prefers-reduced-motion.",
  },
  "text-spacing": {
    impact:
      "Users who override line height, letter spacing, or word spacing lose content when the page locks those properties with !important (WCAG 1.4.12 / RGAA 10.12).",
    howToFix:
      "Drop !important from letter-spacing, line-height, word-spacing, and paragraph-spacing so user stylesheets can apply.",
  },
  "use-of-color": {
    impact:
      "Users who cannot distinguish color (or see links in grayscale) miss cues that exist only as a color change (WCAG 1.4.1 / RGAA 3.1).",
    howToFix:
      "Underline links in running text, or add a second cue (icon, text, pattern) in addition to color.",
  },
  "empty-th": {
    impact:
      "Screen reader users navigating a data table hear an unnamed header and cannot associate cells with columns (WCAG 1.3.1 / RGAA 5.6).",
    howToFix:
      "Put the column or row name in the <th>, or add aria-label when the header is visual-only.",
  },
  "dialog-name": {
    impact:
      "Screen reader users hear only “dialog” and cannot tell what the modal is for or how to complete it (WCAG 4.1.2 / RGAA 7.1).",
    howToFix:
      "Set aria-labelledby to the visible heading id, or aria-label when there is no visible title.",
  },
  "tab-name": {
    impact:
      "Tabs without names are indistinguishable in the tab list, so users cannot reach the panel they need (WCAG 4.1.2 / RGAA 7.1).",
    howToFix:
      "Give each tab visible text, or an aria-label that names the panel.",
  },
  "summary-name": {
    impact:
      "An unnamed disclosure control is announced as “summary” with no hint of what it expands (WCAG 4.1.2 / RGAA 7.1).",
    howToFix:
      "Put the section name inside <summary>, or add aria-label.",
  },
  "frame-keyboard": {
    impact:
      "Keyboard users cannot reach or cannot leave interactive content inside an iframe (WCAG 2.1.1 / RGAA 7.3).",
    howToFix:
      "Ensure the iframe is in the tab order when it contains controls, and that focus can move in and out without a trap.",
  },
  "p-as-heading": {
    impact:
      "A paragraph styled as a heading is missing from the document outline that screen reader users navigate by (WCAG 1.3.1 / RGAA 9.1).",
    howToFix:
      "Replace the styled <p> with the matching h1–h6, or add role=\"heading\" and aria-level if a native heading is impossible.",
  },
  "doctype": {
    impact:
      "Without a doctype, browsers may use quirks mode and assistive technologies can misread the tree (RGAA 8.1).",
    howToFix:
      "Emit a <!DOCTYPE html> at the start of the document (Next.js does this by default — do not render an html shell that omits it).",
  },
  "fieldset-legend": {
    impact:
      "Ungrouped radios are announced as separate questions, so users cannot tell they are alternatives of the same choice (WCAG 1.3.1 / RGAA 11.6).",
    howToFix:
      "Wrap the group in <fieldset> with a <legend>, or role=\"radiogroup\" / role=\"group\" with aria-label.",
  },
  "autocomplete-purpose": {
    impact:
      "Password managers and browsers cannot fill identity fields, which blocks users with cognitive disabilities (WCAG 1.3.5 / RGAA 11.13).",
    howToFix:
      'Add autoComplete with a token such as "email", "current-password", "name", or "tel" on identity fields.',
  },
  "no-accesskey": {
    impact:
      "Single-key accessKey shortcuts steal keystrokes from screen readers and cannot be turned off (WCAG 2.1.4 / RGAA 12.10).",
    howToFix:
      "Remove accessKey. If a shortcut is essential, require a modifier and provide a way to remap or disable it.",
  },
  optgroup: {
    impact:
      "Ungrouped option clusters are announced as a flat list, so users cannot tell which category an option belongs to (WCAG 1.3.1 / RGAA 11.8).",
    howToFix:
      'Add label="…" on each <optgroup>. Do not leave the group unnamed.',
  },
  "table-caption": {
    impact:
      "A data table without a caption is just “table” in the outline; users cannot tell what the numbers are about (WCAG 1.3.1 / RGAA 5.4).",
    howToFix:
      "Add a <caption> as the first child, or aria-labelledby pointing at a visible heading.",
  },
  "th-scope": {
    impact:
      "Without scope or headers/id, screen readers cannot tell whether a header labels a row or a column (WCAG 1.3.1 / RGAA 5.7).",
    howToFix:
      'Set scope="col" or scope="row" on each <th>, or wire complex tables with id + headers.',
  },
  "layout-table-markup": {
    impact:
      "A layout table that still has <th> or caption is announced as a data table, which garbles the reading order (WCAG 1.3.1 / RGAA 5.8).",
    howToFix:
      "Remove th/caption/headers/scope from presentation tables, or replace the table with CSS layout.",
  },
  "svg-name": {
    impact:
      "An informative SVG without a name is silent for screen reader users (WCAG 1.1.1 / RGAA 1.1).",
    howToFix:
      'Add a <title>, aria-label, or aria-labelledby. Mark decorative SVG with role="presentation" or aria-hidden.',
  },
  "figure-caption": {
    impact:
      "Caption text next to an image is not associated, so assistive technologies announce the image without its legend (WCAG 1.1.1 / RGAA 1.9).",
    howToFix:
      "Put the caption in <figcaption> inside the same <figure> as the image.",
  },
  "redundant-role": {
    impact:
      "Repeating a native implicit role (role=\"button\" on <button>) can confuse some assistive technologies (WCAG 1.3.1 / RGAA 8.9).",
    howToFix:
      "Remove the redundant role. Keep an explicit role only when the host is a generic element (div/span).",
  },
  "noninteractive-tabindex": {
    impact:
      "A generic element in the tab order traps keyboard users on a node they cannot operate (WCAG 2.1.1 / RGAA 12.8).",
    howToFix:
      "Remove tabIndex={0}, or add an interactive role plus keyboard handlers if it is a custom widget.",
  },
  "aria-activedescendant": {
    impact:
      "aria-activedescendant on a non-focusable host never receives keyboard events, so the active option is not announced (WCAG 4.1.2 / RGAA 7.1).",
    howToFix:
      "Put tabIndex={0} on the composite (listbox, combobox, grid, tree) that owns aria-activedescendant.",
  },
  "focus-visible": {
    impact:
      "Keyboard users cannot tell which control is focused when the focus ring is invisible (WCAG 2.4.7 / RGAA 10.7).",
    howToFix:
      "Restore a visible :focus-visible style — outline, ring, border, or box-shadow — on every interactive control.",
  },
  "keyboard-trap": {
    impact:
      "Keyboard users cannot Tab out of a widget and are stuck away from the rest of the page (WCAG 2.1.2 / RGAA 12.9).",
    howToFix:
      "Ensure Tab and Shift+Tab can leave every component. Modal dialogs may trap focus only while open and must return focus on close.",
  },
  "focus-not-obscured": {
    impact:
      "A sticky header, cookie banner, or toast covers the focused control so keyboard users cannot see what is active (WCAG 2.4.11).",
    howToFix:
      "Scroll focused controls into view, reduce sticky overlay height, or dismiss overlays before focus moves underneath them.",
  },
  "accessible-auth": {
    impact:
      "Blocking autocomplete or paste prevents password managers and assistive technologies from filling credentials (WCAG 3.3.8).",
    howToFix:
      'Use autocomplete="current-password" or "username" on login fields. Do not call preventDefault on paste for credential inputs.',
  },
  dragging: {
    impact:
      "Users who cannot perform drag gestures cannot reorder or move items when drag is the only path (WCAG 2.5.7).",
    howToFix:
      "Add buttons or inputs that perform the same action (move up/down, numeric position) alongside draggable handles.",
  },
  "new-window-onload": {
    impact:
      "A window that opens on load disorients screen reader users and steals focus without an explicit request (RGAA 13.2).",
    howToFix:
      "Open new windows only from click or keyboard handlers. Remove window.open from mount effects and module scope.",
  },
  "dir-change": {
    impact:
      "Mixed-direction text without dir is read in the wrong order by assistive technologies (WCAG 1.3.2 / RGAA 8.10).",
    howToFix:
      'Wrap RTL passages in an element with dir="rtl" (or dir="ltr" inside RTL pages).',
  },
  "blockquote-cite": {
    impact:
      "A cited quotation without visible citation text hides the source from screen reader users (WCAG 1.3.1 / RGAA 9.4).",
    howToFix:
      "Add a <cite> element or visible attribution inside the blockquote when cite points at a source.",
  },
  "outline-none": {
    impact:
      "Removing the default outline without a replacement hides keyboard focus in source (WCAG 2.4.7 / RGAA 10.7).",
    howToFix:
      "Pair outline-none with focus-visible:ring or an equivalent visible focus style on the same element.",
  },
  "status-live": {
    impact:
      "Validation errors and toasts are not announced when they appear, so screen reader users miss feedback (WCAG 4.1.3 / RGAA 7.5).",
    howToFix:
      'Put status text in role="status" or role="alert", or add aria-live="polite" on the message container.',
  },
  "non-text-contrast": {
    impact:
      "Low-contrast borders and control chrome are hard to see for low-vision users (WCAG 1.4.11 / RGAA 3.3).",
    howToFix:
      "Raise border, icon, and focus-ring contrast to at least 3:1 against the adjacent background.",
  },
  reflow: {
    impact:
      "Horizontal scrolling at 320px forces zoomed and mobile users to pan sideways to read content (WCAG 1.4.10 / RGAA 10.11).",
    howToFix:
      "Use responsive layout, flex/grid wrapping, and max-width:100% so content reflows in one column.",
  },
  "text-spacing-runtime": {
    impact:
      "When users apply WCAG text-spacing overrides, content is clipped or hidden (WCAG 1.4.12 / RGAA 10.12).",
    howToFix:
      "Remove fixed heights and overflow:hidden on text containers; allow line-height and spacing to grow.",
  },
  "hover-content": {
    impact:
      "Supplementary content shown only on hover cannot be reached or dismissed by keyboard users (WCAG 1.4.13).",
    howToFix:
      "Make help content persistent, dismissable, and reachable via focus; do not rely on hover-only tooltips.",
  },
  "label-adjacent": {
    impact:
      "A distant label forces sighted users to hunt for which field it names (WCAG 3.3.2 / RGAA 11.4).",
    howToFix:
      "Place the <label> immediately before or above its control, or wrap the input inside the label.",
  },
  "both-colors": {
    impact:
      "Setting only color or only background breaks when users apply their own stylesheet (WCAG 1.4.3 / RGAA 10.5).",
    howToFix:
      "Declare both color and background-color together on text containers.",
  },
  "redundant-entry": {
    impact:
      "Re-asking for email, name, or address in the same flow wastes time and blocks users with cognitive disabilities (WCAG 3.3.7).",
    howToFix:
      "Reuse prior values with hidden fields, session state, or autocomplete instead of duplicate inputs.",
  },
};

export function guidanceFor(checkId: CheckId): CheckGuidance {
  return guidance[checkId];
}