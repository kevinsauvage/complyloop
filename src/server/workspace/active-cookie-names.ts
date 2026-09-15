/**
 * Active workspace cookie names. Import-free on purpose: the Playwright
 * harness (`e2e/auth.ts`, loaded by `playwright.config.ts` in plain Node)
 * imports this leaf directly, bypassing `./active-cookies` (`server-only` /
 * `next/headers`). Server code takes the names from here too.
 */
export const ACTIVE_ORG_COOKIE = "complyloop_active_org";
export const ACTIVE_PROJECT_COOKIE = "complyloop_active_project";
