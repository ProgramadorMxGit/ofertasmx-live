/**
 * Next.js configuration.
 *
 * `next/image` optimizes remote product images stored in Supabase Storage. The
 * allowed remote host is derived from `NEXT_PUBLIC_SUPABASE_URL` so we never
 * hard-code a project ref and never open the optimizer to arbitrary hosts. The
 * local fallback (`/fallback-offer.svg`) needs no pattern. If the env var is
 * absent (e.g. a credential-free build), no remote pattern is added.
 */

/** @type {(import('next').NextConfig)['images']['remotePatterns']} */
const remotePatterns = [
  // Mercado Libre image CDN
  { protocol: "https", hostname: "*.mlstatic.com" },
  { protocol: "http", hostname: "*.mlstatic.com" },
  // Amazon product images
  { protocol: "https", hostname: "m.media-amazon.com" },
  { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
  { protocol: "https", hostname: "*.ssl-images-amazon.com" },
  // Generic HTTPS images (og:image from any allowed product URL)
  { protocol: "https", hostname: "**" },
];


/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns,
  },
};

export default nextConfig;
