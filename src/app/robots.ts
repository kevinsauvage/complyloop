import type { MetadataRoute } from "next";

/**
 * Crawlers: only public marketing routes are indexable. Authenticated
 * workspace routes and APIs are disallowed (see Metadata/SEO guidance in
 * node_modules/next/dist/docs).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/legal/"],
        disallow: [
          "/api/",
          "/dashboard",
          "/findings",
          "/evidence/",
          "/evidence",
          "/requirements",
          "/org",
          "/settings",
        ],
      },
    ],
  };
}
