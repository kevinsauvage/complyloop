import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DnsLookup } from "@complyloop/analysis-core/runtime/url-safety";

import { discoverRuntimeRoutes } from "./runtime-routes-discovery";

const BASE = "https://preview.example.com";

/** Public address so the SSRF guard never needs real DNS. */
const lookup: DnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function urlset(...locs: string[]): string {
  return `<urlset>${locs
    .map((loc) => `<url><loc>${loc}</loc></url>`)
    .join("")}</urlset>`;
}

function index(...locs: string[]): string {
  return `<sitemapindex>${locs
    .map((loc) => `<sitemap><loc>${loc}</loc></sitemap>`)
    .join("")}</sitemapindex>`;
}

/** Routes requests to canned responses; unmatched URLs 404. */
function stubFetch(routes: Record<string, Response | (() => Response)>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const entry = routes[url];
      if (entry === undefined) return new Response("nope", { status: 404 });
      return typeof entry === "function" ? entry() : entry;
    }),
  );
}

function xml(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discoverRuntimeRoutes", () => {
  it("follows the sitemap declared in robots.txt", async () => {
    stubFetch({
      [`${BASE}/robots.txt`]: new Response(
        "User-agent: *\nSitemap: /sitemap-pages.xml\n",
        { status: 200 },
      ),
      [`${BASE}/sitemap-pages.xml`]: xml(urlset(`${BASE}/`, `${BASE}/pricing`)),
    });

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "robots",
      paths: ["/", "/pricing"],
      truncated: false,
    });
  });

  it("falls back to /sitemap.xml when robots.txt has no directive", async () => {
    stubFetch({
      [`${BASE}/robots.txt`]: new Response("User-agent: *\n", { status: 200 }),
      [`${BASE}/sitemap.xml`]: xml(urlset(`${BASE}/pricing`)),
    });

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "sitemap",
      paths: ["/pricing"],
      truncated: false,
    });
  });

  it("falls back to /sitemap.xml when robots.txt is missing", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: xml(urlset(`${BASE}/`)),
    });

    await expect(
      discoverRuntimeRoutes(BASE, { lookup }),
    ).resolves.toMatchObject({ source: "sitemap", paths: ["/"] });
  });

  it("follows one level of sitemap index", async () => {
    stubFetch({
      [`${BASE}/robots.txt`]: new Response(`Sitemap: ${BASE}/sitemap.xml`, {
        status: 200,
      }),
      [`${BASE}/sitemap.xml`]: xml(
        index(`${BASE}/pages.xml`, `${BASE}/posts.xml`),
      ),
      [`${BASE}/pages.xml`]: xml(urlset(`${BASE}/`, `${BASE}/pricing`)),
      [`${BASE}/posts.xml`]: xml(urlset(`${BASE}/blog`)),
    });

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "robots",
      paths: ["/", "/pricing", "/blog"],
      truncated: false,
    });
  });

  it("reports none when the site has no sitemap", async () => {
    stubFetch({});

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "none",
      paths: [],
      truncated: false,
    });
  });

  it("keeps only same-origin paths", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: xml(
        urlset(`${BASE}/kept`, "https://other.example.com/nope"),
      ),
    });

    await expect(
      discoverRuntimeRoutes(BASE, { lookup }),
    ).resolves.toMatchObject({ paths: ["/kept"] });
  });

  it("decodes a gzipped sitemap", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: new Response(
        gzipSync(Buffer.from(urlset(`${BASE}/gzipped`), "utf8")),
        { status: 200, headers: { "content-type": "application/gzip" } },
      ),
    });

    await expect(
      discoverRuntimeRoutes(BASE, { lookup }),
    ).resolves.toMatchObject({ paths: ["/gzipped"] });
  });

  it("follows a same-origin redirect to the sitemap", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: () =>
        new Response(null, {
          status: 301,
          headers: { location: `${BASE}/sitemap-2.xml` },
        }),
      [`${BASE}/sitemap-2.xml`]: xml(urlset(`${BASE}/moved`)),
    });

    await expect(
      discoverRuntimeRoutes(BASE, { lookup }),
    ).resolves.toMatchObject({ source: "sitemap", paths: ["/moved"] });
  });

  it("stops at a redirect that leaves public address space", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === `${BASE}/sitemap.xml`) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/sitemap.xml" },
        });
      }
      throw new Error(`must not fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // The refusal is a content problem (the site redirects somewhere blocked),
    // not a bad preview URL, so it degrades to "nothing to offer".
    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "none",
      paths: [],
      truncated: false,
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://127.0.0.1/sitemap.xml",
      expect.anything(),
    );
  });

  it("skips a robots.txt sitemap hosted on a blocked host", async () => {
    stubFetch({
      [`${BASE}/robots.txt`]: new Response(
        "Sitemap: http://10.0.0.5/sitemap.xml\nSitemap: /sitemap.xml\n",
        { status: 200 },
      ),
      [`${BASE}/sitemap.xml`]: xml(urlset(`${BASE}/kept`)),
    });

    await expect(
      discoverRuntimeRoutes(BASE, { lookup }),
    ).resolves.toMatchObject({ source: "robots", paths: ["/kept"] });
  });

  it("flags truncation when an index has more children than the budget", async () => {
    const children = Array.from(
      { length: 8 },
      (_value, index) => `${BASE}/child-${index}.xml`,
    );
    stubFetch({
      [`${BASE}/sitemap.xml`]: xml(index(...children)),
      ...Object.fromEntries(
        children.map((child, index) => [
          child,
          xml(urlset(`${BASE}/page-${index}`)),
        ]),
      ),
    });

    const result = await discoverRuntimeRoutes(BASE, { lookup });

    expect(result.source).toBe("sitemap");
    expect(result.truncated).toBe(true);
    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.paths.length).toBeLessThan(children.length);
  });

  it("refuses a private preview URL before any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      discoverRuntimeRoutes("http://169.254.169.254/", { lookup }),
    ).rejects.toThrow(/localhost, private, or metadata/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores a response that is not a sitemap", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: xml("<html><body>hello</body></html>"),
    });

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "none",
      paths: [],
      truncated: false,
    });
  });

  it("gives up on an oversized document", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: new Response("a".repeat(1_100_000), {
        status: 200,
      }),
    });

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "none",
      paths: [],
      truncated: false,
    });
  });

  it("survives a document that throws while streaming", async () => {
    stubFetch({
      [`${BASE}/sitemap.xml`]: new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection reset"));
          },
        }),
        { status: 200 },
      ),
    });

    await expect(discoverRuntimeRoutes(BASE, { lookup })).resolves.toEqual({
      source: "none",
      paths: [],
      truncated: false,
    });
  });
});
