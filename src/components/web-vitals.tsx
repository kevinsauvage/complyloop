"use client";

import * as Sentry from "@sentry/nextjs";
import { useReportWebVitals } from "next/web-vitals";

/**
 * Field Core Web Vitals → Sentry. Mounted once in the root layout; the client
 * boundary stays confined to this leaf (`02-guides/analytics.md`). Sentry's
 * `browserTracingIntegration` is not enabled, so this is the only CWV source.
 *
 * `ponytail:` only non-"good" ratings are sent, so a healthy site emits
 * nothing. Send every rating (sampled) if you need the full distribution.
 */

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

/** Stable reference — the hook re-reports whenever this identity changes. */
function reportWebVital(metric: Metric): void {
  if (metric.rating === "good") return;
  Sentry.captureEvent({
    message: `web-vital ${metric.name}`,
    level: "info",
    tags: {
      "web-vital.name": metric.name,
      "web-vital.rating": metric.rating,
      "web-vital.navigation_type": metric.navigationType,
    },
    measurements: {
      [metric.name.toLowerCase()]: {
        value: metric.value,
        // CLS is unitless; the rest are durations.
        unit: metric.name === "CLS" ? "none" : "millisecond",
      },
    },
  });
}

export function WebVitals() {
  useReportWebVitals(reportWebVital);
  return null;
}
