import type * as Sentry from "@sentry/nextjs";

import { redactSecrets } from "@/lib/redact";

/** Trace sample rate for Sentry.init across Node, Edge, and the browser. */
export function sentryTracesSampleRate(): number {
  return process.env.NODE_ENV === "production" ? 0.05 : 0;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (depth >= 3 || typeof value !== "object" || value === null) return value;
  if (Array.isArray(value))
    return value.map((item) => scrubValue(item, depth + 1));
  const scrubbed: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    scrubbed[key] = scrubValue(entry, depth + 1);
  }
  return scrubbed;
}

/**
 * Last line of defence before an event leaves the process: messages, exception
 * values and structured fields are free text (engine errors, URLs, GitHub
 * responses) and can carry credential-shaped strings.
 */
function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.message) event.message = redactSecrets(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSecrets(exception.value);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) {
      breadcrumb.message = redactSecrets(breadcrumb.message);
    }
    if (breadcrumb.data)
      breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  }
  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }
  if (event.tags) event.tags = scrubValue(event.tags) as Record<string, string>;
  if (event.contexts) {
    event.contexts = scrubValue(
      event.contexts,
    ) as Sentry.ErrorEvent["contexts"];
  }
  if (event.request) {
    event.request = scrubValue(event.request) as Sentry.ErrorEvent["request"];
  }
  return event;
}

/** Sentry.init options shared by the Node, Edge, and browser runtimes. */
export function sentryInitOptions(
  dsn: string | undefined,
): Parameters<typeof Sentry.init>[0] {
  if (
    !dsn &&
    process.env.NODE_ENV !== "test" &&
    typeof console !== "undefined"
  ) {
    console.warn(
      "[sentry] DSN is unset — Sentry error capture is disabled. " +
        "Set SENTRY_DSN (server/edge) and NEXT_PUBLIC_SENTRY_DSN (browser).",
    );
  }
  return {
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: sentryTracesSampleRate(),
    beforeSend: (event) => scrubSentryEvent(event),
  };
}
