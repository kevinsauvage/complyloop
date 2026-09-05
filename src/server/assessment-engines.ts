import { DEFAULT_THEME_CONDITIONS } from "@complyloop/analysis-core/runtime/theme-conditions";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";

interface RuntimeScanEngineInput {
  pagesScanned: number;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
  linkCheckRan?: boolean;
  error?: string;
}

/** Single place that maps a runtime scan result to persisted assessment engines. */
export function buildAssessmentEngines(
  runtimeConfigured: boolean,
  runtimeRan: boolean,
  runtimeResult: RuntimeScanEngineInput,
): AssessmentEngines {
  const scanFeatures: Array<
    NonNullable<AssessmentEngines["scanFeatures"]>[number]
  > = [];
  if (runtimeRan) {
    if (runtimeResult.siteLevelChecksRan) scanFeatures.push("site_level");
    if (runtimeResult.htmlValidateRan) scanFeatures.push("html_validate");
    if (runtimeResult.linkCheckRan) scanFeatures.push("link_check");
    if (runtimeConfigured) scanFeatures.push("theme_conditions");
  }

  return {
    ast: true,
    runtime: runtimeRan,
    runtimePagesScanned: runtimeResult.pagesScanned,
    scanFeatures: scanFeatures.length > 0 ? scanFeatures : undefined,
    themeConditions: runtimeConfigured ? [...DEFAULT_THEME_CONDITIONS] : undefined,
    runtimeError: runtimeResult.error,
  };
}

export function assessmentEngineFeatureRan(
  engines: AssessmentEngines | undefined,
  feature: NonNullable<AssessmentEngines["scanFeatures"]>[number],
): boolean {
  return engines?.scanFeatures?.includes(feature) ?? false;
}
