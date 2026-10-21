import { sentryInitOptions } from "./init";

type ClientSentry = typeof import("@sentry/nextjs");

let loading: Promise<ClientSentry | null> | null = null;

/**
 * Browser Sentry, loaded on demand instead of at boot. The SDK is ~134 KB
 * over the wire and every page view paid for it; only an error boundary or a
 * non-"good" web vital needs it, and both are rare. `import()` keeps it out of
 * the initial bundle (this is the page-weight lever EcoIndex measures).
 *
 * Returns `null` when the browser DSN is unset — nothing is loaded and
 * capture stays a no-op, same as before.
 */
export function clientSentry(): Promise<ClientSentry | null> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return Promise.resolve(null);
  loading ??= import("@sentry/nextjs").then((Sentry) => {
    Sentry.init(sentryInitOptions(dsn));
    return Sentry;
  });
  return loading;
}
