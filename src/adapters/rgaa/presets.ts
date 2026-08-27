import { rgaaControls, rgaaFramework } from "./controls";
import type { FrameworkPreset } from "@/adapters/types";

export type { FrameworkPreset };

/** Curated subsets of the seeded RGAA/WCAG adapter for one-click scoping. */
export const rgaaPresets: FrameworkPreset[] = [
  {
    id: "preset-rgaa-full",
    name: "Full RGAA/WCAG subset",
    description: "Every machine-checkable control shipped in the MVP adapter.",
    frameworkId: rgaaFramework.id,
    controlIds: rgaaControls.map((control) => control.id),
  },
  {
    id: "preset-images-media",
    name: "Images & media",
    description: "Text alternatives, frames, and autoplay media.",
    frameworkId: rgaaFramework.id,
    controlIds: [
      "ctl-img-alt",
      "ctl-iframe-title",
      "ctl-autoplay-media",
    ],
  },
  {
    id: "preset-forms-names",
    name: "Forms & accessible names",
    description: "Labels, buttons, links, and autocomplete purpose.",
    frameworkId: rgaaFramework.id,
    controlIds: [
      "ctl-input-label",
      "ctl-button-name",
      "ctl-link-name",
      "ctl-form-error-association",
      "ctl-autocomplete-valid",
      "ctl-label-in-name",
    ],
  },
  {
    id: "preset-structure",
    name: "Page structure",
    description: "Language, headings, lists, viewport zoom, and focus order.",
    frameworkId: rgaaFramework.id,
    controlIds: [
      "ctl-html-lang",
      "ctl-heading-order",
      "ctl-empty-heading",
      "ctl-focus-order",
      "ctl-duplicate-id",
      "ctl-aria-hidden-focusable",
      "ctl-list-structure",
      "ctl-meta-viewport",
      "ctl-page-heading",
      "ctl-content-region",
      "ctl-no-orientation-lock",
      "ctl-landmark-unique",
    ],
  },
  {
    id: "preset-heuristics",
    name: "Advanced heuristics",
    description:
      "Lower-confidence AST checks for pointer/keyboard parity, context changes, sensory instructions, images of text, and error suggestions. Surfaces items for human review.",
    frameworkId: rgaaFramework.id,
    controlIds: [
      "ctl-pointer-gesture",
      "ctl-pointer-cancellation",
      "ctl-motion-actuation",
      "ctl-focus-context-change",
      "ctl-input-context-change",
      "ctl-sensory-characteristics",
      "ctl-image-of-text",
      "ctl-error-suggestion",
    ],
  },
];
