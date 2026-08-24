import fs from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";
import type { BrowserContextOptions } from "@playwright/test";
import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_PROJECT_COOKIE,
} from "../src/server/active-cookies";
import {
  E2E_ORG_ID,
  E2E_OWNER,
  E2E_PROJECT_ID,
  E2E_VIEWER,
} from "./constants";
import { resolveE2EAuthSecret } from "./env";

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");
export const OWNER_STATE = path.join(AUTH_DIR, "owner.json");
export const VIEWER_STATE = path.join(AUTH_DIR, "viewer.json");
export const ANON_STATE = path.join(AUTH_DIR, "anon.json");

/** Cookie name Auth.js uses for http:// AUTH_URL (no __Secure- prefix). */
const SESSION_COOKIE = "authjs.session-token";

async function mintSessionCookie(user: {
  id: string;
  login: string;
  name: string;
  email: string;
}): Promise<{ name: string; value: string }> {
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

function storageState(
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

export async function writeAuthStates(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const ownerSession = await mintSessionCookie(E2E_OWNER);
  const viewerSession = await mintSessionCookie(E2E_VIEWER);
  const workspaceCookies = [
    { name: ACTIVE_PROJECT_COOKIE, value: E2E_PROJECT_ID },
    { name: ACTIVE_ORG_COOKIE, value: E2E_ORG_ID },
  ];

  fs.writeFileSync(
    OWNER_STATE,
    JSON.stringify(
      storageState([ownerSession, ...workspaceCookies]),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    VIEWER_STATE,
    JSON.stringify(
      storageState([viewerSession, ...workspaceCookies]),
      null,
      2,
    ),
  );
  fs.writeFileSync(ANON_STATE, JSON.stringify(storageState([]), null, 2));
}
