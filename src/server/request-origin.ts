import "server-only";

import { headers } from "next/headers";

/**
 * Absolute origin of the current request, for links in copied text (there is
 * no configured public app URL). Behind Vercel's proxy the forwarded headers
 * carry the public host; a spoofed Host only affects the requester's own
 * clipboard, so this must never be used for redirects or auth.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host =
    (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000")
      .split(",")[0]
      ?.trim() ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
