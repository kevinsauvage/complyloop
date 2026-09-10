import { createRequire } from "node:module";
import path from "node:path";

import { expect, type Page,test } from "@playwright/test";

const require = createRequire(path.join(process.cwd(), "package.json"));
const axePath = require.resolve("axe-core/axe.min.js");

type AxeViolation = {
  id: string;
  impact?: string | null;
  help: string;
  nodes: unknown[];
};

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: { runOnly: { type: string; values: string[] } },
          ) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    return results.violations;
  });
}

function seriousOrWorse(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
}

const pages = [
  { path: "/", name: "dashboard" },
  { path: "/findings", name: "findings" },
  { path: "/evidence", name: "evidence" },
  { path: "/settings", name: "settings" },
  { path: "/org", name: "organization account" },
  { path: "/requirements", name: "requirements" },
  { path: "/legal/terms", name: "terms" },
  { path: "/legal/privacy", name: "privacy" },
];

test.describe("axe accessibility", () => {
  for (const target of pages) {
    test(`${target.name} has no serious+ axe violations`, async ({ page }) => {
      await page.goto(target.path);
      await page.waitForLoadState("networkidle");
      const violations = seriousOrWorse(await runAxe(page));
      expect(
        violations,
        violations.map((v) => `${v.id}: ${v.help}`).join("\n"),
      ).toEqual([]);
    });
  }
});
