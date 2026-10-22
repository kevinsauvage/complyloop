/**
 * Runtime orchestration entry (stage 2 of the analysis pipeline): SSRF-safe
 * navigation → axe + custom probes + html-validate + link checks →
 * `RuntimeScanResult`. Engines stay behind `scanRuntime` (injectable via
 * `RuntimePageScanner` for tests) — server code never imports
 * `custom-checks/*` or `site-level/*` internals. See
 * `packages/analysis-core/README.md`.
 */

import type { Browser } from "playwright-core";

let sharedBrowser: Browser | null = null;

/**
 * Set when teardown timed out: the cached browser may hold a leaked context,
 * so the next scan launches fresh instead of reusing it. The leak is
 * container-lifetime-bounded (serverless discards the whole process).
 */
let sharedBrowserTainted = false;

/**
 * Teardown must never sink a scan whose findings are already collected:
 * `page.close()` / `context.close()` have waited minutes on pages with open
 * connections. Bound the wait, warn, and continue with what was collected.
 */
const TEARDOWN_TIMEOUT_MS = 15_000;

export async function closeTeardown(
  label: "page" | "context",
  closing: Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closing,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} close timed out`)),
          TEARDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    sharedBrowserTainted = true;
    console.warn(
      `[warning] runtime ${label} close timed out; continuing with collected findings.`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Worker-script teardown: close the cached browser so a long-lived process
 * can exit. Serverless never needs this (the container dies with the
 * invocation); the GitHub Actions executor hangs on the browser child
 * process after the batch summary prints without it. Bounded like
 * page/context teardown, never throws.
 */
export async function closeRuntimeBrowser(): Promise<void> {
  const browser = sharedBrowser;
  sharedBrowser = null;
  sharedBrowserTainted = false;
  if (!browser) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("browser close timed out")),
          TEARDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    console.warn(
      "[warning] runtime browser close timed out; continuing to exit.",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The only variables the browser inherits. The worker process holds
 * `DATABASE_URL` and the GitHub App private key, and Playwright passes the
 * whole `process.env` to Chromium by default — a renderer exploit on an
 * audited page must find no secrets to read.
 */
const BROWSER_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "FONTCONFIG_PATH",
] as const;

export function browserEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of BROWSER_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/**
 * Runtime audits run on the GitHub Actions executor, which installs its own
 * Playwright Chromium (`npm run playwright:install`); local dev does the same.
 * There is no serverless-browser path — nothing Vercel-reachable imports this
 * module (see `docs/vercel.md`).
 *
 * The sandbox is explicit because Playwright disables it by default on Linux;
 * Ubuntu 24.04 runners must allow unprivileged user namespaces for it
 * (`apparmor_restrict_unprivileged_userns=0`, set in the workflows).
 */
export async function getBrowser(): Promise<Browser> {
  if (sharedBrowserTainted) {
    // A previous teardown timed out and may have leaked a context — do not
    // reuse this browser. No close attempt: close is what hung last time.
    sharedBrowser = null;
    sharedBrowserTainted = false;
  }
  if (!sharedBrowser) {
    console.info("[progress] runtime browser launch started");
    const { chromium } = await import("playwright-core");
    sharedBrowser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      env: browserEnv(),
    });
    process.on("exit", () => {
      sharedBrowser?.close().catch(() => {});
    });
  }
  return sharedBrowser;
}
