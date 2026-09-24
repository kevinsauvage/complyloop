import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CheckId } from "./check-registry.ts";
import { allChecks } from "./checks/registry.ts";
import { jsxA11yMappedCheckIds } from "./jsx-a11y-map.ts";
import { lintJsxA11y } from "./jsx-a11y-scan.ts";
import { parseSource } from "./parse.ts";
import { scanProject } from "./scan.ts";

/**
 * Kitchen-sink coverage: `e2e/fixtures/sample-app/` must trigger every
 * AST + jsx-a11y check at least once, so the e2e assessment exercises the
 * full source engine end to end.
 *
 * Exception: `empty-heading` is pinned by `e2e/webhook.spec.ts`, which
 * requires that control to pass at a clean baseline — the sink directory
 * must stay empty-heading-free, so it is covered by a direct lint assertion
 * below instead of a sink file.
 */
const SINK_ROOT = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample-app",
);

const WEBHOOK_PINNED: ReadonlySet<CheckId> = new Set<CheckId>([
  "empty-heading",
]);

describe("kitchen-sink source coverage", () => {
  it("fires every AST + jsx-a11y check at least once", () => {
    const { findings, filesScanned } = scanProject(SINK_ROOT);
    expect(filesScanned).toBeGreaterThanOrEqual(8);
    const fired = new Set(findings.map((finding) => finding.checkId));
    const expected = new Set<CheckId>([
      ...allChecks.map((check) => check.id),
      ...jsxA11yMappedCheckIds(),
    ]);
    for (const pinned of WEBHOOK_PINNED) expected.delete(pinned);
    const missing = [...expected].filter((id) => !fired.has(id)).sort();
    expect(missing).toEqual([]);
  });

  it("fires empty-heading on an empty heading (webhook-pinned, no sink file)", () => {
    const parsed = parseSource(
      "EmptyHeading.tsx",
      `export function X() { return <h1 />; }`,
    );
    const findings = lintJsxA11y(parsed);
    expect(
      findings.some((finding) => finding.checkId === "empty-heading"),
    ).toBe(true);
  });
});
