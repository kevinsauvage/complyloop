import type { BrowserContextOptions } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { loadLocalEnv } from "../scripts/env";
import { resolveE2EAuthSecret } from "./env";

/** Cookie name Auth.js uses for http:// AUTH_URL (no __Secure- prefix). */
export const SESSION_COOKIE = "authjs.session-token";

export interface E2ESessionUser {
  id: string;
  login: string;
  name: string;
  email: string;
}

/** Mints the Auth.js session JWT cookie Playwright uses to authenticate. */
export async function mintSessionCookie(
  user: E2ESessionUser,
): Promise<{ name: string; value: string }> {
  const secret = resolveE2EAuthSecret();
  const value = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      login: user.login,
    },
    secret,
    salt: SESSION_COOKIE,
  });
  return { name: SESSION_COOKIE, value };
}

/** Wraps cookies as a Playwright storage state scoped to localhost. */
export function storageState(
  cookies: Array<{ name: string; value: string }>,
): BrowserContextOptions["storageState"] {
  return {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    })),
    origins: [],
  };
}

/**
 * Resolves the DB URL the e2e suite queries. Loads `.env.local` then `.env`
 * (same order as scripts) and prefers `E2E_DATABASE_URL` over `DATABASE_URL`.
 */
export function resolveE2EDbUrl(): string {
  loadLocalEnv();
  return (
    process.env.E2E_DATABASE_URL?.trim() ??
    process.env.DATABASE_URL?.trim() ??
    "postgres://complyloop:complyloop@localhost:5433/complyloop"
  );
}
