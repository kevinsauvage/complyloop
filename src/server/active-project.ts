import { cookies } from "next/headers";

export const ACTIVE_PROJECT_COOKIE = "complyloop_active_project";

/** Reads the per-browser active project cookie (not shared across users). */
export async function readActiveProjectCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_PROJECT_COOKIE)?.value;
  return value && value.length > 0 ? value : null;
}

export async function writeActiveProjectCookie(
  projectId: string,
): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}
