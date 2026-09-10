import "server-only";

import { cache } from "react";

import { auth } from "@/auth";

/**
 * Request-scoped session. The app layout, cached loaders, route handlers, and
 * server actions all call this instead of `auth()` directly so the JWT is
 * decoded once per request rather than 3–4 times.
 */
export const getSession = cache(() => auth());
