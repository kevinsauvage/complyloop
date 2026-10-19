import type { Page } from "playwright-core";
import { beforeEach, describe, expect, it } from "vitest";

import { capturePageSnapshot } from "./snapshot";

function pageThatEvaluatesInJsdom(): Page {
  return {
    evaluate: async <Arg, Result>(
      fn: (arg: Arg) => Result,
      arg: Arg,
    ): Promise<Result> => fn(arg),
  } as Page;
}

beforeEach(() => {
  document.documentElement.lang = "fr";
  document.title = "Accueil";
  document.body.innerHTML = `
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/help">Aide</a>
        <a href="/sitemap.xml">Sitemap</a>
        <a href="#main">Skip</a>
      </nav>
      <form role="search">
        <label for="q">Search</label>
        <input id="q" name="q" type="search" />
      </form>
    </header>
    <main id="main">
      <h1>Welcome</h1>
      <form>
        <label for="email">Email</label>
        <input id="email" name="email" autocomplete="email" />
      </form>
    </main>
    <footer></footer>
  `;
});

describe("capturePageSnapshot", () => {
  it("collects title, lang, landmarks, nav, help, search, and form fields", async () => {
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/",
    );

    expect(snapshot.url).toBe("https://example.test/");
    expect(snapshot.title).toBe("Accueil");
    expect(snapshot.htmlLang).toBe("fr");
    expect(snapshot.pageHeading).toBe("Welcome");
    expect(snapshot.navLinks).toEqual([
      "Home::/",
      "About::/about",
      "Aide::/help",
      "Sitemap::/sitemap.xml",
      "Skip::#main",
    ]);
    expect(snapshot.helpLinks).toEqual(["Aide::/help"]);
    expect(snapshot.searchInputs).toEqual([{ name: "q", type: "search" }]);
    expect(snapshot.sitemapLinks).toEqual(["/sitemap.xml"]);
    expect(snapshot.sitemapHref).toBe("/sitemap.xml");
    expect(snapshot.searchSelector).toBeTruthy();
    expect(snapshot.landmarkRoles).toEqual(
      expect.arrayContaining([
        "banner",
        "navigation",
        "main",
        "contentinfo",
        "search",
      ]),
    );
    expect(snapshot.formFields).toEqual([
      { name: "q", label: "Search", autoComplete: undefined },
      { name: "email", label: "Email", autoComplete: "email" },
    ]);
    expect(snapshot.elementIds).toEqual(
      expect.arrayContaining(["q", "main", "email"]),
    );
    expect(snapshot.fragmentLinks).toEqual([{ href: "#main", label: "Skip" }]);
  });

  it("covers landmark, label, and fragment fallbacks", async () => {
    document.body.innerHTML = `
      <footer></footer>
      <aside></aside>
      <form><input name="plain" type="text" /></form>
      <nav><a href="">empty</a><a href="/help">Help</a></nav>
      <input type="text" />
      <input name="lonely" />
      <a href="page#">trailing</a>
      <a href="#">bare</a>
    `;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/edge",
    );
    expect(snapshot.landmarkRoles).toEqual(
      expect.arrayContaining(["contentinfo", "complementary", "navigation"]),
    );
    expect(snapshot.landmarkRoles).not.toContain("search");
    expect(snapshot.navLinks).toEqual(["Help::/help"]);
    expect(snapshot.formFields).toEqual([
      { name: "plain", label: "", autoComplete: undefined },
      { name: "lonely", label: "", autoComplete: undefined },
    ]);
    expect(snapshot.fragmentLinks).toEqual([]);
  });

  it("prefers aria-labelledby and aria-label over nearby text", async () => {
    document.body.innerHTML = `
      <span id="name-label">Full name</span>
      <input name="full" aria-labelledby="name-label" />
      <input name="nick" aria-label="Nickname" />
    `;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/form",
    );
    expect(snapshot.formFields).toEqual([
      { name: "full", label: "Full name", autoComplete: undefined },
      { name: "nick", label: "Nickname", autoComplete: undefined },
    ]);
  });

  it.each([
    ['<a href="/site-map">Plan</a>', "/site-map"],
    ['<a href="/site_map">Map</a>', "/site_map"],
    ['<a href="/plan-du-site">Plan</a>', "/plan-du-site"],
    ['<a href="/pages">Site map</a>', "/pages"],
  ])("recognizes a site map link: %s", async (markup, href) => {
    document.body.innerHTML = `<footer>${markup}</footer>`;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/",
    );
    expect(snapshot.sitemapHref).toBe(href);
  });

  it("does not mistake unrelated links for a site map", async () => {
    document.body.innerHTML = `<footer><a href="/map-of-offices">Offices</a></footer>`;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/",
    );
    expect(snapshot.sitemapLinks).toEqual([]);
  });

  it("takes primary navigation from the banner, not breadcrumbs or footer lists", async () => {
    document.body.innerHTML = `
      <header><nav aria-label="Main"><a href="/">Home</a><a href="/shop">Shop</a></nav></header>
      <main><nav aria-label="Breadcrumb"><a href="/">Home</a><a href="/shop/ring">Ring</a></nav></main>
      <footer><nav aria-label="Footer"><a href="/terms">Terms</a></nav></footer>
    `;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/shop/ring",
    );
    expect(snapshot.navLinks).toEqual(["Home::/", "Shop::/shop"]);
  });

  it("falls back to every navigation landmark when there is no banner nav", async () => {
    document.body.innerHTML = `<nav><a href="/a">A</a></nav><nav><a href="/b">B</a></nav>`;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/",
    );
    expect(snapshot.navLinks).toEqual(["A::/a", "B::/b"]);
  });

  it("records a link or button that leads to search", async () => {
    document.body.innerHTML = `<header><a aria-label="Search" href="/en/search">icon</a></header>`;
    const snapshot = await capturePageSnapshot(
      pageThatEvaluatesInJsdom(),
      "https://example.test/",
    );
    expect(snapshot.searchEntries).toEqual(["Search"]);
    expect(snapshot.searchInputs).toEqual([]);
  });
});
