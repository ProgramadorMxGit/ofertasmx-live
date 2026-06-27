import { describe, expect, it } from "vitest";

import { isSupabaseBrowserConfigured } from "@/lib/supabase/browser";

/**
 * Regression guard for the "GET / 500" crash: in local dev without Supabase
 * credentials the browser client must NOT be considered configured, so callers
 * (the realtime feed, the admin login) degrade gracefully instead of letting
 * `createBrowserClient` throw "Your project's URL and API key are required".
 *
 * The predicate is pure and takes a synthetic env, mirroring the
 * `validateEnv` / `loadServerEnv` testing pattern in `lib/env.ts`.
 */
describe("isSupabaseBrowserConfigured", () => {
  it("is false when URL or key is missing or empty", () => {
    expect(isSupabaseBrowserConfigured({})).toBe(false);
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      }),
    ).toBe(false);
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toBe(false);
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toBe(false);
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toBe(false);
  });

  it("is false when the URL is malformed or not http(s)", () => {
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toBe(false);
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "ftp://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toBe(false);
  });

  it("is true when both URL and key are present and the URL is http(s)", () => {
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toBe(true);
    expect(
      isSupabaseBrowserConfigured({
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toBe(true);
  });
});
