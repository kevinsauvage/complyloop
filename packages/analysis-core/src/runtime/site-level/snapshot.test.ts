import type { Page } from "playwright";
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
});
