import type { Page } from "playwright-core";

import { PublicError } from "../contract/public-error.ts";

/** Max time to wait for DOMContentLoaded on a preview route. */
export const RUNTIME_GOTO_TIMEOUT_MS = 30_000;

/**
 * Brief settle after DOMContentLoaded so client-mounted widgets can attach.
 * Do not use `networkidle` — SPAs with analytics or HMR often never reach it.
 * Animations are frozen in {@link gotoForRuntimeAudit} so a short settle is enough.
 */
export const RUNTIME_POST_DOM_SETTLE_MS = 250;

/** CSS injected before axe so fade-ins / transitions do not change the tree between runs. */
export const RUNTIME_AUDIT_MOTION_FREEZE_CSS = `*, *::before, *::after {
  animation: none !important;
  transition: none !important;
}`;

function normalizePathname(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

/** Origin + pathname must match; query/hash drift is ignored. */
export function runtimePageMatchesAuditedUrl(
  loadedUrl: string,
  auditedUrl: string,
): boolean {
  try {
    const loaded = new URL(loadedUrl);
    const audited = new URL(auditedUrl);
    return (
      loaded.origin === audited.origin &&
      normalizePathname(loaded.pathname) === normalizePathname(audited.pathname)
    );
  } catch {
    return false;
  }
}

export async function gotoForRuntimeAudit(
  page: Page,
  url: string,
): Promise<void> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: RUNTIME_GOTO_TIMEOUT_MS,
  });
  // Portfolio/marketing pages often mount with opacity-0 + CSS fade-ins. Without
  // freezing motion, axe sees a different set of contrast nodes every run.
  // Best-effort: addStyleTag shares Playwright's CSP-error race with
  // addScriptTag, so page script noise can reject it — and a restrictive
  // style-src can block it outright. Either failure only costs determinism,
  // never evidence, so it must not fail the scan.
  try {
    await page.addStyleTag({ content: RUNTIME_AUDIT_MOTION_FREEZE_CSS });
  } catch {
    // Motion not frozen; axe still runs on the live tree.
  }
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(RUNTIME_POST_DOM_SETTLE_MS);
  const status = response?.status() ?? 0;
  if (status < 200 || status >= 300) {
    throw new PublicError(
      `Preview page returned HTTP ${status || "no response"}.`,
    );
  }
  if (!runtimePageMatchesAuditedUrl(page.url(), url)) {
    throw new PublicError("Preview page redirected away from the audited URL.");
  }
  const hasDocument = await page.evaluate(() => {
    const root = document.documentElement;
    return Boolean(root?.innerHTML.trim());
  });
  if (!hasDocument) {
    throw new PublicError("Preview page did not render a document.");
  }
}
