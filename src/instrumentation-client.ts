import * as Sentry from "@sentry/nextjs";

import { sentryInitOptions } from "./sentry/init";

Sentry.init(sentryInitOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
