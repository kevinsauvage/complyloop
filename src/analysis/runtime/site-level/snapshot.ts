import type { Page } from "playwright";
import type { RuntimePageSnapshot } from "./types";

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
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      if (href && /sitemap/i.test(href)) {
        sitemapLinks.push(href);
      }
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

    return {
      url: pageUrl,
      title: document.title,
      navLinks,
      helpLinks,
      searchInputs,
      sitemapLinks,
      formFields,
    };
  }, url);
}
