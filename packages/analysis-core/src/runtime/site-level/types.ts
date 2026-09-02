export interface RuntimePageSnapshot {
  url: string;
  title: string;
  navLinks: string[];
  helpLinks: string[];
  searchInputs: Array<{ name?: string; type: string }>;
  sitemapLinks: string[];
  formFields: Array<{ name: string; label: string; autoComplete?: string }>;
  /** First sitemap link href when present. */
  sitemapHref?: string;
  /** Stable path to the sitemap entry point for cross-route comparison (12.4). */
  sitemapPosition?: string;
  /** Stable path to the primary search control for cross-route comparison (12.5). */
  searchSelector?: string;
  /** Landmark roles in document order (banner, navigation, main, …). */
  landmarkRoles: string[];
}
