import { describe, expect, it, vi } from "vitest";

import type { CheckId } from "../check-registry.ts";
import { checkIdForAxeRule } from "./axe-map.ts";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./custom-checks/playwright-page";
import { registerPlaywrightBrowserTeardown } from "./custom-checks/playwright-test-teardown";
import { htmlValidateFindingsForPage } from "./html-validate-runtime";
import { runAxeOnPage } from "./scan";
import { runSiteLevelChecks } from "./site-level/checks";
import { brokenLinkFindingsForUrls } from "./site-level/link-check";
import type { RuntimePageSnapshot } from "./site-level/types";
import { THEME_SENSITIVE_AXE_RULES } from "./theme-conditions";
import { emulateCoarsePointer } from "./viewport-conditions";

registerPlaywrightBrowserTeardown();

vi.mock("linkinator", () => ({
  LinkState: { OK: "OK", BROKEN: "BROKEN", SKIPPED: "SKIPPED" },
  check: async () => ({ passed: true, links: [] }),
}));

vi.mock("./url-safety.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./url-safety.js")>();
  return {
    ...actual,
    assertSafeRuntimeUrl: vi.fn(async () => undefined),
  };
});

/**
 * Engine kitchen-sink: axe-only, html-validate, site-level, and link checks
 * must fire on dedicated bad pages. Complements the AST kitchen-sink
 * (`src/kitchen-sink-coverage.test.ts`) and the custom-probe kitchen-sink
 * (`custom-checks/kitchen-sink-runtime.test.ts`) — together the three files
 * cover every check id in `CHECK_REGISTRY`.
 */

const AXE_SINK = `<html lang="en"><head>
<style>
.low{color:#999;background:#fff}
.mid{color:#767676;background:#fff}
.tiny{width:16px;height:16px;padding:0;overflow:hidden}
.plain-link{text-decoration:none}
@media screen and (orientation: portrait) { .lockme { transform: rotate(90deg); } }
</style>
</head><body>
<nav><a href="/a">Home</a></nav>
<nav><a href="/b">Home</a></nav>
<p>Read the <a class="plain-link" href="/guide">full guide</a> for details.</p>
<p class="low">Low contrast body copy that fails the AA threshold.</p>
<p class="mid">Mid gray copy passes AA but fails the AAA threshold.</p>
<button type="button">Outer <a href="/inner">inner link</a></button>
<table><tr><td>A1</td><td>B1</td><td>C1</td><td>D1</td><td>E1</td></tr><tr><td>A2</td><td>B2</td><td>C2</td><td>D2</td><td>E2</td></tr><tr><td>A3</td><td>B3</td><td>C3</td><td>D3</td><td>E3</td></tr><tr><td>A4</td><td>B4</td><td>C4</td><td>D4</td><td>E4</td></tr><tr><td>A5</td><td>B5</td><td>C5</td><td>D5</td><td>E5</td></tr></table>
<button type="button" aria-label="Submit the form">OK</button>
<a href="https://x.test/news">Read more</a>
<a href="https://x.test/blog">Read more</a>
<div tabindex="0">Focusable div without a role</div>
<table><tr><td><b>Fake caption row</b></td></tr><tr><td>value</td></tr></table>
<p lang="e">Bonjour</p>
<div role="paragraph" aria-roledescription="fancy paragraph">Descriptive text</div>
<a href="/y" role="presentation">Presentational link</a>
<div class="lockme">Orientation locked box</div>
<p style="display:none">Hidden text for the hidden-content rule.</p>
<iframe title="Promo" srcdoc="<a href='/z'>Ad link</a>"></iframe>
<button type="button" class="tiny" aria-label="Mini action">M</button>
</body></html>`;

/** Checks the production wiring (default axe run + theme/target-size passes) emits. */
const REACHABLE_AXE_TARGETS: ReadonlyArray<CheckId> = [
  "document-title",
  "bypass",
  "landmark-one-main",
  "landmark-unique",
  "nested-interactive",
  "page-heading",
  "content-region",
  "color-contrast",
  "color-contrast-enhanced",
  "use-of-color",
  "lang-parts",
  "presentation-role",
  "frame-keyboard",
];

/**
 * Checks axe-core 4.13 never emits under the production wiring
 * (`enabled: false` experimental/deprecated/AAA rules). Each entry is
 * `checkId: axeRuleId: reason`. The dormant test below asserts they stay
 * absent from the wiring run (canary for axe upgrades) AND fire when forced
 * via `runOnly` (trigger validity) — except `doctype`, whose axe rule
 * (`html-has-doctype`) no longer exists at all.
 */
const DORMANT_AXE_CHECKS: ReadonlyArray<{
  checkId: CheckId;
  axeRuleId: string;
}> = [
  { checkId: "label-in-name", axeRuleId: "label-content-name-mismatch" },
  { checkId: "focus-order-logical", axeRuleId: "focus-order-semantics" },
  { checkId: "table-headers", axeRuleId: "td-has-header" },
  { checkId: "aria-roledescription", axeRuleId: "aria-roledescription" },
  { checkId: "no-orientation-lock", axeRuleId: "css-orientation-lock" },
  { checkId: "hidden-content", axeRuleId: "hidden-content" },
  {
    checkId: "identical-links-purpose",
    axeRuleId: "identical-links-same-purpose",
  },
];

function axeCheckIds(
  results: ReadonlyArray<{ violations: Array<{ id: string }>; incomplete: Array<{ id: string }> }>,
): Set<CheckId> {
  const fired = new Set<CheckId>();
  for (const result of results) {
    for (const violation of [...result.violations, ...result.incomplete]) {
      const checkId = checkIdForAxeRule(violation.id);
      if (checkId) fired.add(checkId);
    }
  }
  return fired;
}

describe("kitchen-sink axe engine", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "fires every production-reachable axe check on the bad page",
    async () => {
      await withProbePage(AXE_SINK, async (page) => {
        // Mirrors the production wiring in runtime/scan.ts: default run +
        // theme-condition pass + coarse-pointer target-size pass.
        const baseline = await runAxeOnPage(page);
        const theme = await runAxeOnPage(page, {
          runOnly: [...THEME_SENSITIVE_AXE_RULES],
        });
        const fired = axeCheckIds([baseline, theme]);
        const missing = REACHABLE_AXE_TARGETS.filter((id) => !fired.has(id));
        expect(missing).toEqual([]);
      });
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "documents axe checks dormant in the production wiring",
    async () => {
      await withProbePage(AXE_SINK, async (page) => {
        const baseline = await runAxeOnPage(page);
        const theme = await runAxeOnPage(page, {
          runOnly: [...THEME_SENSITIVE_AXE_RULES],
        });
        const wired = axeCheckIds([baseline, theme]);
        // Canary: if an axe upgrade enables one of these by default, move it
        // to REACHABLE_AXE_TARGETS instead of deleting this assertion.
        const leaked = DORMANT_AXE_CHECKS.filter(({ checkId }) =>
          wired.has(checkId),
        ).map(({ checkId }) => checkId);
        expect(leaked).toEqual([]);
        // Trigger validity: every dormant check fires when its rule is forced.
        const forced = await runAxeOnPage(page, {
          runOnly: DORMANT_AXE_CHECKS.map(({ axeRuleId }) => axeRuleId),
        });
        const forcedFired = axeCheckIds([forced]);
        const dead = DORMANT_AXE_CHECKS.filter(
          ({ checkId }) => !forcedFired.has(checkId),
        ).map(({ checkId }) => checkId);
        expect(dead).toEqual([]);
      });
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "doctype has no axe rule in axe-core 4.13 (dead check)",
    async () => {
      await withProbePage(AXE_SINK, async (page) => {
        await expect(
          runAxeOnPage(page, { runOnly: ["html-has-doctype"] }),
        ).rejects.toThrow(/unknown rule/);
      });
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "fires no-auto-refresh on a timed refresh page",
    async () => {
      await withProbePage(
        `<!doctype html><html lang="en"><head><title>t</title><meta http-equiv="refresh" content="30"></head><body><p>Redirects soon.</p></body></html>`,
        async (page) => {
          const { violations } = await runAxeOnPage(page, {
            runOnly: ["meta-refresh", "meta-refresh-no-exceptions"],
          });
          const fired = new Set(
            violations
              .map((v) => checkIdForAxeRule(v.id))
              .filter((id): id is CheckId => id !== undefined),
          );
          expect(fired.has("no-auto-refresh")).toBe(true);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "fires target-size under a coarse pointer",
    async () => {
      await withProbePage(AXE_SINK, async (page) => {
        const { violations } = await emulateCoarsePointer(page, () =>
          runAxeOnPage(page, { runOnly: ["target-size"] }),
        );
        const fired = new Set(
          violations
            .map((v) => checkIdForAxeRule(v.id))
            .filter((id): id is CheckId => id !== undefined),
        );
        expect(fired.has("target-size")).toBe(true);
      });
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

describe("kitchen-sink html-validate engine", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "fires markup-nesting and css-for-presentation",
    async () => {
      await withProbePage(
        `<!doctype html><html lang="en"><head><title>t</title></head><body>
          <ul><div><li>Div inside list</li></div></ul>
          <font color="red">Deprecated presentational markup</font>
        </body></html>`,
        async (page) => {
          const findings = await htmlValidateFindingsForPage(
            page,
            "https://bad-site.test/",
          );
          const fired = new Set(findings.map((f) => f.checkId));
          expect(fired.has("markup-nesting")).toBe(true);
          expect(fired.has("css-for-presentation")).toBe(true);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

function badSiteSnapshots(): RuntimePageSnapshot[] {
  return [
    {
      url: "https://bad-site.test/a",
      title: "Same Title",
      htmlLang: "en",
      pageHeading: "Welcome",
      elementIds: ["main-a"],
      fragmentLinks: [],
      navLinks: ["Home::/", "About::/about"],
      helpLinks: ["Help::/help", "Contact::/contact"],
      searchInputs: [],
      searchSelector: "header form[role=search]",
      sitemapLinks: [],
      sitemapHref: "/sitemap",
      sitemapPosition: "footer",
      formFields: [{ name: "email", label: "Email address" }],
      landmarkRoles: ["banner", "navigation", "main"],
    },
    {
      url: "https://bad-site.test/b",
      title: "Same Title",
      htmlLang: "fr",
      elementIds: ["main-b"],
      fragmentLinks: [],
      navLinks: ["About::/about", "Home::/"],
      helpLinks: ["Contact::/contact", "Help::/help"],
      searchInputs: [],
      sitemapLinks: [],
      formFields: [{ name: "email", label: "E-mail" }],
      landmarkRoles: ["banner", "navigation"],
    },
  ];
}

describe("kitchen-sink site-level engine", () => {
  it("fires all ten site-level checks on the bad-site pair", () => {
    const findings = runSiteLevelChecks(badSiteSnapshots());
    const fired = new Set(findings.map((f) => f.checkId));
    const expected: ReadonlyArray<CheckId> = [
      "multiple-ways",
      "consistent-nav",
      "consistent-labels",
      "consistent-help",
      "consistent-sitemap",
      "consistent-search",
      "consistent-landmarks",
      "duplicate-page-title",
      "consistent-lang",
      "consistent-page-heading",
    ];
    expect([...expected].filter((id) => !fired.has(id))).toEqual([]);
  });
});

describe("kitchen-sink link engine", () => {
  it("fires broken-link on a dangling same-page fragment", async () => {
    const findings = await brokenLinkFindingsForUrls(
      ["https://bad-site.test/"],
      {
        snapshots: [
          {
            url: "https://bad-site.test/",
            title: "Home",
            htmlLang: "en",
            elementIds: ["intro"],
            fragmentLinks: [{ href: "#missing", label: "Skip" }],
            navLinks: [],
            helpLinks: [],
            searchInputs: [],
            sitemapLinks: [],
            formFields: [],
            landmarkRoles: [],
          },
        ],
      },
    );
    expect(findings.some((f) => f.checkId === "broken-link")).toBe(true);
  });
});
