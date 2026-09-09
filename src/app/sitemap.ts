import type { MetadataRoute } from "next";

function baseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

/**
 * Public marketing routes only — workspace routes require auth and must not
 * be indexed (see Metadata/SEO guidance in node_modules/next/dist/docs).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = baseUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now },
    { url: `${base}/login`, lastModified: now },
    { url: `${base}/legal/privacy`, lastModified: now },
    { url: `${base}/legal/terms`, lastModified: now },
  ];
}
