// Public entry for @complyloop/analysis-core (bare specifier).
// Consumers typically import subpaths (e.g. @complyloop/analysis-core/scan)
// for tree-shaking; this aggregates the main surface for convenience.
export * from "./types.js";
export * from "./parse.js";
export * from "./scan.js";
export * from "./fixes.js";
export * from "./merge-findings.js";
export * from "./check-authority.js";
export * from "./checks/registry.js";