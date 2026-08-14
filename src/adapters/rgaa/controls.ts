import type { Control, Framework } from "@/core/project-types";

export const rgaaFramework: Framework = {
  id: "fw-rgaa-wcag",
  name: "RGAA 4 / WCAG 2.1 (accessibility subset)",
  version: "2026.3",
};

export const rgaaControls: Control[] = [
  {
    id: "ctl-img-alt",
    frameworkId: rgaaFramework.id,
    code: "WCAG 1.1.1",
    secondaryCode: "RGAA 1.1",
    title: "Images have a text alternative",
    description:
      "Every informative image exposes a text alternative; decorative images are explicitly marked as such.",
    checkId: "img-alt",
    complianceWeight: 1.4,
  },
  {
    id: "ctl-button-name",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 11.9",
    title: "Buttons have an accessible name",
    description:
      "Every button exposes a name describing its action, via text content or an ARIA label.",
    checkId: "button-name",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-link-name",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.4.4",
    secondaryCode: "RGAA 6.1",
    title: "Links have an accessible name",
    description:
      "Every link exposes a name describing its destination, via text content, image alternatives, or an ARIA label.",
    checkId: "anchor-name",
    complianceWeight: 1.2,
  },
  {
    id: "ctl-html-lang",
    frameworkId: rgaaFramework.id,
    code: "WCAG 3.1.1",
    secondaryCode: "RGAA 8.3",
    title: "The page declares its language",
    description:
      "The document's default human language is programmatically determinable via the lang attribute.",
    checkId: "html-lang",
    complianceWeight: 1.5,
  },
  {
    id: "ctl-focus-order",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.4.3",
    secondaryCode: "RGAA 12.8",
    title: "Focus order is logical",
    description:
      "Keyboard focus follows the natural document order; no element forces a custom order with a positive tabindex.",
    checkId: "positive-tabindex",
    complianceWeight: 1.2,
  },
  {
    id: "ctl-input-label",
    frameworkId: rgaaFramework.id,
    code: "WCAG 3.3.2",
    secondaryCode: "RGAA 11.1",
    title: "Form fields have labels",
    description:
      "Every form field exposes a label telling users what to enter, via <label> association or ARIA attributes.",
    checkId: "input-label",
    complianceWeight: 1.4,
  },
  {
    id: "ctl-heading-order",
    frameworkId: rgaaFramework.id,
    code: "WCAG 1.3.1",
    secondaryCode: "RGAA 9.1",
    title: "Heading levels follow a logical order",
    description:
      "Headings do not skip levels in the document outline (e.g. h2 must not jump to h4).",
    checkId: "heading-order",
    complianceWeight: 1.1,
  },
  {
    id: "ctl-empty-heading",
    frameworkId: rgaaFramework.id,
    code: "WCAG 1.3.1",
    secondaryCode: "RGAA 9.2",
    title: "Headings have accessible names",
    description:
      "Every heading exposes text or an ARIA name so the outline is usable.",
    checkId: "empty-heading",
    complianceWeight: 1.1,
  },
  {
    id: "ctl-iframe-title",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 2.1",
    title: "Frames have a title",
    description:
      "Every iframe exposes a title describing its purpose to assistive technologies.",
    checkId: "iframe-title",
    complianceWeight: 1.2,
  },
  {
    id: "ctl-autoplay-media",
    frameworkId: rgaaFramework.id,
    code: "WCAG 1.4.2",
    secondaryCode: "RGAA 4.1",
    title: "Media does not autoplay",
    description:
      "Audio and video do not start automatically; users control playback.",
    checkId: "autoplay-media",
    complianceWeight: 1.1,
  },
  {
    id: "ctl-duplicate-id",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.1",
    secondaryCode: "RGAA 8.2",
    title: "IDs are unique",
    description:
      "id attributes are unique within a document so labels and ARIA references resolve correctly.",
    checkId: "duplicate-id",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-form-error-association",
    frameworkId: rgaaFramework.id,
    code: "WCAG 3.3.1",
    secondaryCode: "RGAA 11.10",
    title: "Form errors are associated with fields",
    description:
      "When a field is invalid, its error message is programmatically associated (e.g. aria-describedby).",
    checkId: "form-error-association",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-aria-hidden-focusable",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 8.9",
    title: "Hidden elements are not focusable",
    description:
      "Elements with aria-hidden must not be reachable by keyboard focus.",
    checkId: "aria-hidden-focusable",
    complianceWeight: 1.4,
  },
  {
    id: "ctl-aria-role",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 8.6",
    title: "ARIA roles are valid",
    description:
      "role values are concrete ARIA roles, not abstract or invented names.",
    checkId: "aria-role",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-aria-props",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 8.7",
    title: "ARIA attributes are valid",
    description:
      "aria-* attributes exist in the ARIA specification (no typos or unknown properties).",
    checkId: "aria-props",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-aria-required-attr",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 8.8",
    title: "Roles include required ARIA properties",
    description:
      "An explicit ARIA role exposes every property that role requires (e.g. checkbox needs aria-checked).",
    checkId: "aria-required-attr",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-no-autofocus",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.4.3",
    secondaryCode: "RGAA 12.7",
    title: "Pages do not steal focus on load",
    description:
      "autoFocus is not used; keyboard and screen reader users keep control of where focus starts.",
    checkId: "no-autofocus",
    complianceWeight: 1.1,
  },
  {
    id: "ctl-keyboard-interaction",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.1.1",
    secondaryCode: "RGAA 12.11",
    title: "Pointer-only controls are also operable by keyboard",
    description:
      "Non-native elements with click or hover handlers are focusable, have an interactive role, and expose equivalent keyboard events.",
    checkId: "keyboard-interaction",
    complianceWeight: 1.4,
  },
  {
    id: "ctl-color-contrast",
    frameworkId: rgaaFramework.id,
    code: "WCAG 1.4.3",
    secondaryCode: "RGAA 3.2",
    title: "Text contrast meets 4.5:1",
    description:
      "Foreground and background color of text meets WCAG AA contrast (measured on the rendered page).",
    checkId: "color-contrast",
    complianceWeight: 1.5,
  },
  {
    id: "ctl-document-title",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.4.2",
    secondaryCode: "RGAA 8.5",
    title: "The page has a title",
    description:
      "The rendered document exposes a non-empty <title> describing the page.",
    checkId: "document-title",
    complianceWeight: 1.2,
  },
  {
    id: "ctl-bypass",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.4.1",
    secondaryCode: "RGAA 12.7",
    title: "A mechanism skips repeated blocks",
    description:
      "The page provides a skip link, landmark, or heading structure so keyboard users can bypass repeated chrome.",
    checkId: "bypass",
    complianceWeight: 1.4,
  },
  {
    id: "ctl-landmark-one-main",
    frameworkId: rgaaFramework.id,
    code: "WCAG 1.3.1",
    secondaryCode: "RGAA 12.6",
    title: "The page has one main landmark",
    description:
      "The rendered page exposes exactly one main landmark for the primary content.",
    checkId: "landmark-one-main",
    complianceWeight: 1.2,
  },
  {
    id: "ctl-nested-interactive",
    frameworkId: rgaaFramework.id,
    code: "WCAG 4.1.2",
    secondaryCode: "RGAA 8.9",
    title: "Interactive controls are not nested",
    description:
      "Buttons, links, and other widgets are not placed inside other widgets (measured on the rendered tree).",
    checkId: "nested-interactive",
    complianceWeight: 1.3,
  },
  {
    id: "ctl-target-size",
    frameworkId: rgaaFramework.id,
    code: "WCAG 2.5.8",
    secondaryCode: "RGAA 11.11",
    title: "Pointer targets are large enough",
    description:
      "Interactive targets meet the WCAG 2.2 minimum size (24×24 CSS pixels) on the rendered page.",
    checkId: "target-size",
    complianceWeight: 1.1,
  },
];
