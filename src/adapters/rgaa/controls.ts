import type { Control, Framework } from "@/core/types";

export const rgaaFramework: Framework = {
  id: "fw-rgaa-wcag",
  name: "RGAA 4 / WCAG 2.1 (accessibility subset)",
  version: "2026.1",
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
  },
];
