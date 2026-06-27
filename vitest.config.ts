import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config — unit + integration suites.
 *
 * - Unit tests cover the pure logic in `lib/` (parser, ssrf, dedup, money, slug).
 * - Integration tests cover the webhook handler with Supabase/Telegram mocked.
 * - Property-based tests use `fast-check` (added as a dependency); no extra
 *   Vitest config is required for it.
 * - End-to-end tests live under `tests/e2e/` and run with Playwright, not Vitest.
 */
export default defineConfig({
  // Components rely on the automatic JSX runtime (no explicit `React` import),
  // matching Next.js; tell esbuild to transform `.tsx` the same way.
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/integration/**/*.{test,spec}.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
