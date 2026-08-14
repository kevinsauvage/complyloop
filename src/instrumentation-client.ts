import * as Sentry from "@sentry/nextjs";
import { sentryTracesSampleRate } from "./sentry/traces-sample-rate";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: sentryTracesSampleRate(),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
