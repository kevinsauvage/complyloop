import { sentryInitOptions } from "./sentry/init";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Load the Sentry browser SDK as a separate chunk, and only when a DSN is
 * configured. When `NEXT_PUBLIC_SENTRY_DSN` is unset (local, CI, self-hosted)
 * the import is never executed, so the ~130 KB gzip SDK stays out of the
 * initial client download instead of shipping on every route.
 *
 * `import()` here is fire-and-forget by design (see the instrumentation-client
 * docs): monitoring may initialize just after hydration, which is acceptable
 * because errors are still captured once it resolves.
 */
const sentryClient: Promise<typeof import("@sentry/nextjs") | null> = dsn
  ? import("@sentry/nextjs").then((Sentry) => {
      Sentry.init(sentryInitOptions(dsn));
      return Sentry;
    })
  : Promise.resolve(null);

export function onRouterTransitionStart(
  href: string,
  navigationType: string,
): void {
  void sentryClient.then((Sentry) =>
    Sentry?.captureRouterTransitionStart(href, navigationType),
  );
}
