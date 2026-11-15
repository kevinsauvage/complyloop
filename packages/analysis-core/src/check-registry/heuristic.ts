import type { CheckRegistration } from "../check-registry.ts";

/** Heuristic checks: an empty scan stays `unable_to_verify`, never `passed`. */
export const HEURISTIC_CHECKS = [
  {
    id: "pointer-gesture",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-pointer-gesture",
  },
  {
    id: "pointer-cancellation",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-pointer-cancellation",
  },
  {
    id: "motion-actuation",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-motion-actuation",
  },
  {
    id: "live-region-updates",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-live-region-updates",
  },
  {
    id: "hover-content",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-hover-content",
  },
  {
    id: "table-summary",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-table-summary",
  },
  {
    id: "image-detailed-description",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-image-detailed-description",
  },
  {
    id: "media-controls-present",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-media-controls-present",
  },
  {
    id: "media-keyboard",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-media-keyboard",
  },
  {
    id: "audio-description-track",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-audio-description",
  },
  {
    id: "link-explicit-heuristic",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-link-explicit",
  },
  {
    id: "lang-change",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-lang-change-indicated",
  },
  {
    id: "cryptic-content-alt",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-cryptic-content-alt",
  },
  {
    id: "audio-description-or-alt",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-audio-description-or-alt",
  },
  {
    id: "captions-live",
    authority: "heuristic",
    analyzers: ["ast"],
    catalogControlId: "ctl-captions-live",
  },
  {
    id: "layout-table-linearization",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-layout-table-linearization",
  },
  {
    id: "error-prevention",
    authority: "heuristic",
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-error-prevention",
  },
  {
    id: "accessible-auth-enhanced",
    authority: "heuristic",
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-accessible-auth-enhanced",
  },
  {
    id: "captcha-alternative",
    authority: "heuristic",
    advisory: true,
    analyzers: ["ast", "playwright-custom"],
    catalogControlId: "ctl-captcha-alternative",
  },
  {
    id: "reduced-motion",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-reduced-motion",
  },
  {
    id: "media-identification",
    authority: "heuristic",
    analyzers: ["playwright-custom"],
    catalogControlId: "ctl-media-identification",
  },
] as const satisfies readonly CheckRegistration[];
