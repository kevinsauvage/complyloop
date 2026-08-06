import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE = "complyloop_active_org";

/** Reads the per-browser active org cookie (user-scoped selection). */
export async function readActiveOrgCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_ORG_COOKIE)?.value;
  return value && value.length > 0 ? value : null;
}

export async function writeActiveOrgCookie(orgId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}
