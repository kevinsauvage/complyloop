import type { CheckRegistration } from "../check-registry.ts";

/** Site-level checks: need a runtime audit over at least two routes. */
export const SITE_LEVEL_CHECKS = [
  {
    id: "multiple-ways",
    authority: "site_level",
    // site_level ∩ runtime-only exception — see CheckRegistration.runtimeOnly
    runtimeOnly: true,
    advisory: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-multiple-ways",
  },
  {
    id: "consistent-nav",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-nav",
  },
  {
    id: "consistent-labels",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-labels",
  },
  {
    id: "consistent-help",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-help",
  },
  {
    id: "consistent-sitemap",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-search-relevant",
  },
  {
    id: "consistent-search",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-nav-mechanisms-relevant",
  },
  {
    id: "consistent-landmarks",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-landmark-regions-consistent",
  },
  {
    id: "duplicate-page-title",
    authority: "site_level",
    runtimeOnly: true,
    analyzers: ["site-level"],
    catalogControlId: "ctl-page-title-unique",
  },
  {
    id: "consistent-lang",
    authority: "site_level",
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-lang",
  },
  {
    id: "consistent-page-heading",
    authority: "site_level",
    analyzers: ["site-level"],
    catalogControlId: "ctl-consistent-page-heading",
  },
] as const satisfies readonly CheckRegistration[];
