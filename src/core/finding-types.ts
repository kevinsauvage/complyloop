/**
 * Re-export from @complyloop/analysis-core — the analysis engine now owns the
 * shared contract types. This file is a compatibility shim so the rest of the
 * platform can keep importing @/core/<name>; canonical source lives in the package.
 */
export * from "@complyloop/analysis-core/contract/finding-types";
