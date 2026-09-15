import { describe, expect, it } from "vitest";

import { rawFindingFromDom } from "./raw-finding-from-dom";

describe("rawFindingFromDom", () => {
  it("strips control characters from external DOM text so payloads stay JSONB-safe", () => {
    const finding = rawFindingFromDom({
      checkId: "forced-colors",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "Control has no visible boundary",
      url: "https://example.com/",
      // A NUL-separated hit identity leaking through as the selector.
      selector: "\u0000\u0000BUTTON",
      snippet: "<button>\u0000</button>",
      elementLabel: "\u0000",
      context: "under forced-colors\u0007mode",
      analyzerId: "playwright-custom",
      analyzerRuleId: "forced-colors",
    });

    expect(finding.location.kind).toBe("dom");
    if (finding.location.kind !== "dom")
      throw new Error("expected dom location");
    expect(finding.location.selector).toBe("BUTTON");
    expect(finding.location.snippet).toBe("<button></button>");
    expect(finding.location.elementLabel).toBe("");
    expect(finding.location.context).toBe("under forced-colorsmode");
    const serialized = JSON.stringify(finding);
    expect(serialized).not.toMatch(/\\u0000|\\u0007/);
    expect(serialized).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("keeps printable text unchanged", () => {
    const finding = rawFindingFromDom({
      checkId: "color-contrast",
      kind: "warning",
      severity: "serious",
      confidence: "medium",
      reason: "Elements must meet minimum color contrast ratio thresholds",
      url: "https://example.com/",
      selector: ".hero p",
      snippet: '<p class="hero">Hello</p>',
      analyzerId: "axe",
      analyzerRuleId: "color-contrast",
    });
    expect(finding.location.kind).toBe("dom");
    if (finding.location.kind !== "dom")
      throw new Error("expected dom location");
    expect(finding.location.selector).toBe(".hero p");
    expect(finding.location.snippet).toBe('<p class="hero">Hello</p>');
  });

  it("roundtrips through PostgreSQL jsonb (the exact PG error case)", async () => {
    const finding = rawFindingFromDom({
      checkId: "forced-colors",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "x",
      url: "https://example.com/",
      selector: "\u0000\u0000A",
      snippet: "<a>\u0000</a>",
      analyzerId: "playwright-custom",
    });
    // Simulate the postgres.js JSON.stringify → PG jsonb parse path.
    const payload = JSON.stringify(finding);
    expect(payload).not.toContain("\\u0000");

    // If a postgres client is available, prove PG accepts the payload.
    const envUrl = process.env.DATABASE_URL;
    if (!envUrl) return;
    const postgresModule = await import("postgres");
    const postgres = (postgresModule.default ?? postgresModule) as (
      url: string,
      opts: { max: number; onnotice: () => void },
    ) => ReturnType<typeof import("postgres")>;
    const sql = postgres(envUrl, { max: 1, onnotice: () => {} });
    try {
      await expect(sql`select ${payload}::jsonb as ok`).resolves.toBeDefined();
    } finally {
      await sql.end();
    }
  });
});
