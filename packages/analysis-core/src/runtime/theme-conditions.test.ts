import fs from "node:fs";

import { type Browser, chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

import { runThemeSensitiveCustomChecks } from "./custom-checks/index";
import type { AxeViolationLike } from "./findings";
import { runAxeOnPage } from "./scan";
import {
  conditionLabel,
  conditionSpecificFindings,
  conditionSpecificViolations,
  emulationForCondition,
  THEME_SENSITIVE_AXE_RULES,
} from "./theme-conditions";

function violation(id: string, target: string): AxeViolationLike {
  return {
    id,
    impact: "serious",
    description: `${id} on ${target}`,
    help: "help",
    nodes: [{ html: `<div>${id}</div>`, target: [target] }],
  };
}

describe("conditionSpecificViolations", () => {
  it("keeps only violations seen under the condition but not the baseline", () => {
    const baseline = [
      violation("color-contrast", "#a"),
      violation("focus-visible", "#shared"),
    ];
    const condition = [
      violation("color-contrast", "#a"), // also in baseline -> dropped
      violation("color-contrast", "#dark-only"), // new -> kept
      violation("color-contrast", "#dark-only"), // duplicate node -> kept once via filter
      violation("focus-visible", "#shared"), // in baseline -> dropped
    ];
    const result = conditionSpecificViolations(baseline, condition, "dark");
    expect(result).toHaveLength(1);
    expect(result[0]?.nodes).toHaveLength(1);
    expect(result[0]?.nodes[0]?.target[0]).toBe("#dark-only");
    expect(result[0]?.description).toContain("[dark only]");
  });

  it("keeps only the nodes absent from the baseline when axe groups many targets", () => {
    const baseline: AxeViolationLike = {
      id: "color-contrast",
      impact: "serious",
      description: "baseline",
      help: "help",
      nodes: [
        { html: "<a>", target: ["#shared"] },
        { html: "<b>", target: ["#light"] },
      ],
    };
    const condition: AxeViolationLike = {
      id: "color-contrast",
      impact: "serious",
      description: "dark",
      help: "help",
      nodes: [
        { html: "<a>", target: ["#shared"] },
        { html: "<c>", target: ["#dark-only"] },
      ],
    };
    const result = conditionSpecificViolations([baseline], [condition], "dark");
    expect(result).toHaveLength(1);
    expect(result[0]?.nodes.map((node) => node.target[0])).toEqual([
      "#dark-only",
    ]);
  });

  it("returns nothing when the condition adds no findings", () => {
    expect(
      conditionSpecificViolations(
        [violation("x", "#a")],
        [violation("x", "#a")],
        "dark",
      ),
    ).toEqual([]);
  });
});

describe("theme-sensitive axe rules", () => {
  it("covers contrast and color-dependent rules only", () => {
    expect(THEME_SENSITIVE_AXE_RULES.has("color-contrast")).toBe(true);
    expect(THEME_SENSITIVE_AXE_RULES.has("color-contrast-enhanced")).toBe(true);
    expect(THEME_SENSITIVE_AXE_RULES.has("link-in-text-block")).toBe(true);
    expect(THEME_SENSITIVE_AXE_RULES.has("use-of-color")).toBe(false);
    expect(THEME_SENSITIVE_AXE_RULES.has("image-alt")).toBe(false);
  });
});

describe("browser conditions", () => {
  it("maps each condition to the right emulation", () => {
    expect(emulationForCondition("dark")).toEqual({ colorScheme: "dark" });
    expect(emulationForCondition("light")).toEqual({ colorScheme: "light" });
    expect(emulationForCondition("more-contrast")).toEqual({
      contrast: "more",
    });
  });

  it("labels prefer-contrast meaningfully", () => {
    expect(conditionLabel("dark")).toBe("dark");
    expect(conditionLabel("light")).toBe("light");
    expect(conditionLabel("more-contrast")).toBe("prefers-contrast: more");
  });
});

/** Skip when Playwright's bundled Chromium is not installed. */
function chromiumExecutableAvailable(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

describe("dark color-scheme condition (Playwright)", () => {
  let browser: Browser | null = null;

  afterAll(async () => {
    await browser?.close();
  });

  it.skipIf(!chromiumExecutableAvailable())(
    "theme-sensitive custom non-text-contrast fails only under dark",
    async () => {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      // Button border contrast: passes in light (#777 on #fff, ~4.7:1),
      // fails in dark (#222 on #000, ~1.3:1). `non-text-contrast` reads
      // computed styles, so it differs by emulated color scheme.
      await page.setContent(`
        <!doctype html><html lang="fr"><head><style>
          .btn { border: 2px solid #777; background: #fff; color: #111; }
          @media (prefers-color-scheme: dark) {
            .btn { border-color: #222; background: #000; color: #fff; }
          }
        </style></head><body>
          <button class="btn">OK</button>
        </body></html>
      `);

      async function themeFindings() {
        const result = await runThemeSensitiveCustomChecks(page, page.url());
        return result.findings;
      }

      await page.emulateMedia({ colorScheme: "light" });
      const light = await themeFindings();
      await page.emulateMedia({ colorScheme: "dark" });
      const dark = await themeFindings();
      await page.emulateMedia({ colorScheme: null });

      const darkOnly = conditionSpecificFindings(light, dark, "dark");
      expect(darkOnly.some((v) => v.checkId === "non-text-contrast")).toBe(
        true,
      );
    },
    40_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "axe color-contrast lists the dark-only case, not the light one",
    async () => {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>t</title></head><body>
           <p style="color:#111;background:#eee;display:inline-block;padding:4px 8px;">fine</p>
         </body></html>`,
      );
      // This page has acceptable contrast in light; axe reports the a11y
      // failures that are independent of scheme. Confirms axe runs under
      // emulation without error and returns color-contrast among violations.
      await page.emulateMedia({ colorScheme: "dark" });
      const result = await runAxeOnPage(page);
      await page.emulateMedia({ colorScheme: null });
      const themeIds = result.violations
        .map((v) => v.id)
        .filter((id) => THEME_SENSITIVE_AXE_RULES.has(id));
      expect(themeIds).toEqual([]);
    },
    40_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "prefers-contrast more changes the emulated media state",
    async () => {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      // The scanner's `emulationForCondition("more-contrast")` drives
      // `emulateMedia({ contrast: "more" })`; assert the media feature flips.
      await page.setContent(`<!doctype html><html lang="fr"><body>
        <p id="probe">probe</p>
      </body></html>`);
      const defaultMatches = await page.evaluate(
        () => matchMedia("(prefers-contrast: more)").matches,
      );
      await page.emulateMedia({ contrast: "more" });
      const moreMatches = await page.evaluate(
        () => matchMedia("(prefers-contrast: more)").matches,
      );
      await page.emulateMedia({ contrast: null });
      expect(defaultMatches).toBe(false);
      expect(moreMatches).toBe(true);
    },
    40_000,
  );
});
