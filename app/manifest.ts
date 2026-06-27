import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME, SITE_SHORT_NAME } from "@/lib/seo/site";

/**
 * Web app manifest (Task 30.1 / R20.2).
 *
 * Names, colours and icons for installability. `theme_color` and
 * `background_color` are the sRGB equivalents of the dark-first design tokens
 * (`--primary` = `hsl(199 89% 52%)`, `--background` = `hsl(222 24% 7%)`) so the
 * PWA chrome matches the site's default theme (R12.3). Icons reuse the existing
 * brand assets.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    lang: "es-MX",
    dir: "ltr",
    background_color: "#0e1016",
    theme_color: "#18adf2",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
