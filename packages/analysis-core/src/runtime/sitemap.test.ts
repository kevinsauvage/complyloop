import { describe, expect, it } from "vitest";

import {
  parseSitemapDocument,
  robotsSitemapUrls,
  SITEMAP_MAX_LOCS,
  sitemapPathsFromLocs,
} from "./sitemap.ts";

const BASE = "https://preview.example.com";

function urlset(...locs: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n")}
</urlset>`;
}

describe("parseSitemapDocument", () => {
  it("reads a urlset and its locations", () => {
    const parsed = parseSitemapDocument(
      urlset(
        "https://preview.example.com/",
        "https://preview.example.com/pricing",
      ),
    );

    expect(parsed.kind).toBe("urlset");
    expect(parsed.locs).toEqual([
      "https://preview.example.com/",
      "https://preview.example.com/pricing",
    ]);
    expect(parsed.truncated).toBe(false);
  });

  it("reads a sitemap index", () => {
    const parsed = parseSitemapDocument(
      `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://preview.example.com/a.xml</loc></sitemap></sitemapindex>`,
    );

    expect(parsed.kind).toBe("index");
    expect(parsed.locs).toEqual(["https://preview.example.com/a.xml"]);
  });

  it("decodes entities and unwraps CDATA", () => {
    const parsed = parseSitemapDocument(
      urlset(
        "https://preview.example.com/search?a=1&amp;b=2",
        "<![CDATA[https://preview.example.com/pricing]]>",
        "\n  <![CDATA[https://preview.example.com/docs]]>\n",
      ),
    );

    expect(parsed.locs).toEqual([
      "https://preview.example.com/search?a=1&b=2",
      "https://preview.example.com/pricing",
      "https://preview.example.com/docs",
    ]);
  });

  it("keeps an out-of-range numeric reference literal instead of throwing", () => {
    // `String.fromCodePoint` raises on these; a hostile sitemap must not turn
    // "unparseable" into a 500.
    const parsed = parseSitemapDocument(
      urlset(`${BASE}/&#x110000;`, `${BASE}/&#xzz;`, `${BASE}/&#xD800;`),
    );

    expect(parsed.locs).toEqual([
      `${BASE}/&#x110000;`,
      `${BASE}/&#xzz;`,
      `${BASE}/&#xD800;`,
    ]);
  });

  it("rejects a hostile document in linear time", () => {
    // Thousands of openers and no closers used to backtrack quadratically
    // (~30 s for 1 MB). The walk must stay linear.
    const hostile = "<loc ".repeat(200_000);
    const commentBomb = "<!-- ".repeat(200_000);
    const started = performance.now();

    expect(parseSitemapDocument(hostile).locs).toEqual([]);
    expect(parseSitemapDocument(`<urlset>${hostile}</urlset>`).locs).toEqual(
      [],
    );
    expect(parseSitemapDocument(commentBomb).locs).toEqual([]);

    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("reads a namespace-prefixed root", () => {
    const parsed = parseSitemapDocument(
      `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/prefixed</loc></url></sm:urlset>`,
    );

    expect(parsed.locs).toEqual([`${BASE}/prefixed`]);
  });

  it("ignores location-like element names", () => {
    const parsed = parseSitemapDocument(
      `<urlset><url><location>${BASE}/not-a-page</location><loc>${BASE}/real</loc></url></urlset>`,
    );

    expect(parsed.locs).toEqual([`${BASE}/real`]);
  });

  it("ignores commented-out locations", () => {
    const parsed = parseSitemapDocument(
      `<urlset><!-- <url><loc>${BASE}/hidden</loc></url> --><url><loc>${BASE}/shown</loc></url></urlset>`,
    );

    expect(parsed.locs).toEqual([`${BASE}/shown`]);
  });

  it("ignores sitemap image/video extension locations", () => {
    const parsed = parseSitemapDocument(
      `<urlset><url><loc>${BASE}/gallery</loc><image:image><image:loc>${BASE}/hero.png</image:loc></image:image></url></urlset>`,
    );

    expect(parsed.locs).toEqual([`${BASE}/gallery`]);
  });

  it("returns an unknown document without locations for malformed input", () => {
    expect(
      parseSitemapDocument("<html><body>not a sitemap</body></html>"),
    ).toEqual({ kind: "unknown", locs: [], truncated: false });
    expect(parseSitemapDocument("")).toEqual({
      kind: "unknown",
      locs: [],
      truncated: false,
    });
  });

  it("caps the number of locations it keeps", () => {
    const many = Array.from(
      { length: SITEMAP_MAX_LOCS + 5 },
      (_value, index) => `${BASE}/page-${index}`,
    );
    const parsed = parseSitemapDocument(urlset(...many));

    expect(parsed.locs).toHaveLength(SITEMAP_MAX_LOCS);
    expect(parsed.truncated).toBe(true);
  });
});

describe("robotsSitemapUrls", () => {
  it("reads absolute and site-relative directives", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /admin",
      "Sitemap: https://preview.example.com/sitemap.xml",
      "Sitemap: /sitemap-news.xml",
    ].join("\n");

    expect(robotsSitemapUrls(robots, BASE)).toEqual([
      "https://preview.example.com/sitemap.xml",
      "https://preview.example.com/sitemap-news.xml",
    ]);
  });

  it("de-duplicates and ignores non-http values", () => {
    const robots = [
      "sitemap: ftp://preview.example.com/sitemap.xml",
      "sitemap: /sitemap.xml",
      "SITEMAP: /sitemap.xml",
    ].join("\n");

    expect(robotsSitemapUrls(robots, BASE)).toEqual([
      "https://preview.example.com/sitemap.xml",
    ]);
  });

  it("returns nothing when there is no directive", () => {
    expect(robotsSitemapUrls("User-agent: *\nDisallow:\n", BASE)).toEqual([]);
  });

  it("returns nothing for an unusable base URL", () => {
    expect(robotsSitemapUrls("Sitemap: /sitemap.xml", "not-a-url")).toEqual([]);
  });
});

describe("sitemapPathsFromLocs", () => {
  it("keeps same-origin paths and drops the query and hash", () => {
    const { paths, truncated } = sitemapPathsFromLocs(
      [
        `${BASE}/`,
        `${BASE}/pricing?plan=pro`,
        `${BASE}/docs#install`,
        `${BASE}/pricing`,
      ],
      BASE,
    );

    expect(paths).toEqual(["/", "/pricing", "/docs"]);
    expect(truncated).toBe(false);
  });

  it("drops other origins and other schemes", () => {
    const { paths } = sitemapPathsFromLocs(
      [
        "https://other.example.com/pricing",
        "mailto:hi@preview.example.com",
        "javascript:alert(1)",
        `${BASE}/kept`,
      ],
      BASE,
    );

    expect(paths).toEqual(["/kept"]);
  });

  it("resolves relative locations against the base", () => {
    const { paths } = sitemapPathsFromLocs(["/pricing", "docs"], BASE);

    expect(paths).toEqual(["/pricing", "/docs"]);
  });

  it("reports truncation only when more eligible paths exist than the limit", () => {
    const locs = [`${BASE}/a`, `${BASE}/b`, `${BASE}/c`];

    expect(sitemapPathsFromLocs(locs, BASE, { limit: 2 })).toEqual({
      paths: ["/a", "/b"],
      truncated: true,
    });
    // Duplicates and cross-origin entries must not read as truncation.
    expect(
      sitemapPathsFromLocs(
        [`${BASE}/a`, `${BASE}/a`, "https://other.example.com/x"],
        BASE,
        { limit: 2 },
      ),
    ).toEqual({ paths: ["/a"], truncated: false });
  });

  it("returns nothing for an unusable base URL", () => {
    expect(sitemapPathsFromLocs([`${BASE}/a`], "nope")).toEqual({
      paths: [],
      truncated: false,
    });
  });
});
