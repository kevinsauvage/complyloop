export interface RuntimePageSnapshot {
  url: string;
  title: string;
  navLinks: string[];
  helpLinks: string[];
  searchInputs: Array<{ name?: string; type: string }>;
  sitemapLinks: string[];
  formFields: Array<{ name: string; label: string; autoComplete?: string }>;
}
