import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/site";

/**
 * robots.txt (Task 30.1 / R20.2).
 *
 * Allows the public site, disallows the admin panel (`/admin`) and the API
 * surface (`/api`) — neither is meant to be crawled — and points crawlers at the
 * sitemap. Prefixes match all nested paths (`/admin` also covers `/admin/...`).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
