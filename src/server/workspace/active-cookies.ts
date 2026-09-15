import "server-only";

import { cookies } from "next/headers";

import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_PROJECT_COOKIE,
} from "./active-cookie-names";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

async function readIdCookie(name: string): Promise<string | null> {
  const store = await cookies();
  const value = store.get(name)?.value;
  return value && value.length > 0 ? value : null;
}

async function writeIdCookie(name: string, value: string): Promise<void> {
  const store = await cookies();
  store.set(name, value, {
    ...cookieOptions,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Reads the per-browser active org cookie (user-scoped selection). */
export function readActiveOrgCookie(): Promise<string | null> {
  return readIdCookie(ACTIVE_ORG_COOKIE);
}

export function writeActiveOrgCookie(orgId: string): Promise<void> {
  return writeIdCookie(ACTIVE_ORG_COOKIE, orgId);
}

/** Reads the per-browser active project cookie (not shared across users). */
export function readActiveProjectCookie(): Promise<string | null> {
  return readIdCookie(ACTIVE_PROJECT_COOKIE);
}

export function writeActiveProjectCookie(projectId: string): Promise<void> {
  return writeIdCookie(ACTIVE_PROJECT_COOKIE, projectId);
}

export async function clearActiveProjectCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_PROJECT_COOKIE);
}
