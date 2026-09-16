import type * as Sentry from "@sentry/nextjs";

/** Trace sample rate for Sentry.init across Node, Edge, and the browser. */
export function sentryTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw != null && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return process.env.NODE_ENV === "production" ? 0.05 : 0;
}

/** Sentry.init options shared by the Node, Edge, and browser runtimes. */
export function sentryInitOptions(
  dsn: string | undefined,
): Parameters<typeof Sentry.init>[0] {
  if (!dsn && process.env.NODE_ENV !== "test" && typeof console !== "undefined") {
    console.warn(
      "[sentry] DSN is unset — Sentry error capture is disabled. " +
        "Set SENTRY_DSN (server/edge) and NEXT_PUBLIC_SENTRY_DSN (browser).",
    );
  }
  return {
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: sentryTracesSampleRate(),
  };
}
