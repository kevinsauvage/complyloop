import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE = "complyloop_active_org";
export const ACTIVE_PROJECT_COOKIE = "complyloop_active_project";

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
