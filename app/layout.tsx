import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo/site";

import "./globals.css";

/**
 * Typography via `next/font` (Task 20.2 / R12.6).
 * - Geist Sans: the interface typeface, exposed as `--font-sans`.
 * - Instrument Serif: a limited editorial accent (H1 / pull quotes), exposed
 *   as `--font-serif`.
 * Both are self-hosted by Next at build time (no runtime requests) and wired
 * into Tailwind's `fontFamily` via the CSS variables below.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Ofertas reales en tiempo real para México`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Site-wide default canonical is the home; pages override with their own
  // `alternates.canonical`. Relative values resolve against `metadataBase`.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "es_MX",
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/**
 * FOUC-safe theme bootstrap (Task 20.3 / R12.3).
 * Runs synchronously as the first thing in <body>, before any visible content
 * paints, so the correct theme is applied with no flash. Priority:
 * stored choice -> OS preference -> dark (the dark-first default).
 */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}var e=document.documentElement;e.setAttribute("data-theme",t);e.style.colorScheme=t;}catch(_){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // `data-theme` is set to the dark default server-side and may be adjusted by
  // the inline script before hydration; `suppressHydrationWarning` keeps React
  // from flagging that intentional pre-paint change.
  return (
    <html
      lang="es"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
