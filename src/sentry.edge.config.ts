import * as Sentry from "@sentry/nextjs";

import { sentryInitOptions } from "./sentry/init";

Sentry.init(sentryInitOptions(process.env.SENTRY_DSN));
