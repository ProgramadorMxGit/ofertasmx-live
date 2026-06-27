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
const remotePatterns = [];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  try {
    const { hostname } = new URL(supabaseUrl);
    remotePatterns.push({
      protocol: "https",
      hostname,
      pathname: "/storage/v1/object/public/**",
    });
  } catch {
    // Malformed URL — skip; image optimization just won't allow this host.
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns,
  },
};

export default nextConfig;
