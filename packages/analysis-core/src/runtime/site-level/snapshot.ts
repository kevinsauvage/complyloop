import type { Page } from "playwright";
import type { RuntimePageSnapshot } from "./types.ts";

export async function capturePageSnapshot(
  page: Page,
  url: string,
): Promise<RuntimePageSnapshot> {
  return page.evaluate((pageUrl) => {
    function accessibleLabel(el: Element): string {
      if (!(el instanceof HTMLElement)) return "";
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
      }
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        const id = el.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label?.textContent) return label.textContent.trim();
        }
      }
      return el.textContent?.trim() ?? "";
    }

    function elementPath(el: Element): string {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body && parts.length < 6) {
        let part = current.tagName.toLowerCase();
        const role = current.getAttribute("role");
        if (role) part += `[role=${role}]`;
        const type = current.getAttribute("type");
        if (type) part += `[type=${type}]`;
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(">");
    }

    function landmarkRole(el: Element): string | null {
      const explicit = el.getAttribute("role")?.toLowerCase();
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === "header") return "banner";
      if (tag === "nav") return "navigation";
      if (tag === "main") return "main";
      if (tag === "footer") return "contentinfo";
      if (tag === "aside") return "complementary";
      if (tag === "form") return "search";
      return null;
    }

    const navLinks: string[] = [];
    for (const nav of document.querySelectorAll("nav, [role='navigation']")) {
      for (const anchor of nav.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href");
        if (!href) continue;
        const label = anchor.textContent?.trim() ?? "";
        navLinks.push(`${label}::${href}`);
      }
    }

    const helpLinks: string[] = [];
    const helpPattern = /help|support|contact|chat|faq|aide/i;
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const label = anchor.textContent?.trim() ?? "";
      if (!helpPattern.test(href) && !helpPattern.test(label)) continue;
      helpLinks.push(`${label}::${href}`);
    }

    const searchInputs: Array<{ name?: string; type: string }> = [];
    for (const input of document.querySelectorAll("input")) {
      const type = (input.getAttribute("type") ?? "text").toLowerCase();
      const name = input.getAttribute("name") ?? undefined;
      const role = input.getAttribute("role");
      const placeholder = input.getAttribute("placeholder")?.toLowerCase() ?? "";
      if (
        type === "search" ||
        role === "searchbox" ||
        (name && /search/i.test(name)) ||
        /search/.test(placeholder)
      ) {
        searchInputs.push({ name, type });
      }
    }

    const sitemapLinks: string[] = [];
    let sitemapHref: string | undefined;
    let sitemapPosition: string | undefined;
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      if (!href || !/sitemap/i.test(href)) continue;
      sitemapLinks.push(href);
      if (!sitemapHref) {
        sitemapHref = href;
        sitemapPosition = elementPath(anchor);
      }
    }

    let searchSelector: string | undefined;
    const searchControl =
      document.querySelector(
        "input[type='search'], [role='searchbox'], input[name*='search' i], [role='search'] input",
      ) ??
      document.querySelector("form[role='search'] input, [role='search']");
    if (searchControl) {
      searchSelector = elementPath(searchControl);
    }

    const landmarkRoles: string[] = [];
    const landmarkSelector =
      "header, nav, main, footer, aside, [role='banner'], [role='navigation'], [role='main'], [role='contentinfo'], [role='search'], form[role='search']";
    for (const el of document.querySelectorAll(landmarkSelector)) {
      const role = landmarkRole(el);
      if (role) landmarkRoles.push(role);
    }

    const formFields: Array<{ name: string; label: string; autoComplete?: string }> =
      [];
    for (const field of document.querySelectorAll("input, select, textarea")) {
      const name = field.getAttribute("name");
      if (!name) continue;
      const autoComplete = field.getAttribute("autocomplete") ?? undefined;
      formFields.push({
        name,
        label: accessibleLabel(field),
        autoComplete,
      });
    }

    const elementIds: string[] = [];
    for (const el of document.querySelectorAll("[id]")) {
      const id = el.getAttribute("id")?.trim();
      if (id) elementIds.push(id);
    }

    const fragmentLinks: Array<{ href: string; label?: string }> = [];
    for (const anchor of document.querySelectorAll("a[href*='#']")) {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") continue;
      const hashIndex = href.indexOf("#");
      if (hashIndex === -1) continue;
      const fragment = href.slice(hashIndex);
      if (fragment.length < 2) continue;
      fragmentLinks.push({
        href,
        label: anchor.textContent?.trim() || undefined,
      });
    }

    const pageHeading =
      document.querySelector("h1")?.textContent?.trim() || undefined;

    return {
      url: pageUrl,
      title: document.title,
      htmlLang: document.documentElement.getAttribute("lang")?.trim() ?? "",
      pageHeading,
      elementIds,
      fragmentLinks,
      navLinks,
      helpLinks,
      searchInputs,
      sitemapLinks,
      formFields,
      sitemapHref,
      sitemapPosition,
      searchSelector,
      landmarkRoles,
    };
  }, url);
}
