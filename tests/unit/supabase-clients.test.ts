import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Unit tests for the typed Supabase clients (Task 10, R8.5/R8.7).
 *
 * These assert the *server/client boundary* without instantiating real network
 * clients. `lib/supabase/server.ts` and `lib/supabase/service.ts` both import
 * `"server-only"`, so importing them in this (node) test would throw by design;
 * instead we read their source and assert the boundary statically. Only the
 * browser client (anon, no `server-only`) is safe to import here, so it is the
 * one we exercise at runtime.
 */

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = resolve(here, "../../lib/supabase");

function source(file: string): string {
  return readFileSync(resolve(supabaseDir, file), "utf8");
}

const serverSrc = source("server.ts");
const serviceSrc = source("service.ts");
const browserSrc = source("browser.ts");

const SERVER_ONLY = /import\s+["']server-only["']/;
const SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY";

/** Find the exported factory function names declared in a module's source. */
function exportedFactories(src: string): string[] {
  const names: string[] = [];
  const re = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe("supabase clients — exported factories", () => {
  it("server.ts exports an async factory function", () => {
    expect(exportedFactories(serverSrc)).toContain("createServerSupabaseClient");
    expect(serverSrc).toMatch(/export\s+async\s+function\s+createServerSupabaseClient/);
  });

  it("service.ts exports a factory function", () => {
    expect(exportedFactories(serviceSrc)).toContain("createServiceRoleClient");
  });

  it("browser.ts exports a factory function that is callable at runtime", () => {
    expect(exportedFactories(browserSrc)).toContain("createBrowserSupabaseClient");
    // The browser module is the only client-safe one, so it can be imported and
    // inspected here. We assert it is a function without calling it (avoids
    // constructing a real client / needing live env).
    expect(typeof createBrowserSupabaseClient).toBe("function");
  });
});

describe("supabase clients — server/client boundary (R8.7)", () => {
  // The service-role key only lives in `serverEnv` (lib/env.server, itself
  // `server-only`). So the precise boundary check is: only service.ts reaches
  // that module / `serverEnv` and reads the key; server.ts and browser.ts use
  // `publicEnv` (anon) only. Mentioning the key NAME in a doc comment is fine —
  // we assert against actual *access*, not string mentions.
  const reachesServiceRoleKey = (src: string): boolean =>
    src.includes("@/lib/env.server") ||
    src.includes("serverEnv") ||
    src.includes(`serverEnv.${SERVICE_ROLE_KEY}`);

  it("service.ts carries the server-only import and reads the service-role key from env", () => {
    expect(serviceSrc).toMatch(SERVER_ONLY);
    expect(serviceSrc).toContain("@/lib/env.server");
    expect(serviceSrc).toContain(`serverEnv.${SERVICE_ROLE_KEY}`);
  });

  it("server.ts is server-only and uses the anon key, never reaching the service-role key", () => {
    expect(serverSrc).toMatch(SERVER_ONLY);
    expect(serverSrc).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(serverSrc).toContain("createServerClient");
    // The anon, RLS-bound server client must not reach the server-only env that
    // holds the service-role key.
    expect(reachesServiceRoleKey(serverSrc)).toBe(false);
  });

  it("browser.ts is anon-only: no server-only import and no access to the service-role key", () => {
    expect(browserSrc).not.toMatch(SERVER_ONLY);
    expect(browserSrc).toContain("createBrowserClient");
    expect(browserSrc).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(reachesServiceRoleKey(browserSrc)).toBe(false);
  });
});

describe("supabase clients — typing", () => {
  it("all three clients are typed with the hand-written Database type", () => {
    for (const src of [serverSrc, serviceSrc, browserSrc]) {
      expect(src).toContain("@/lib/supabase/types");
      expect(src).toMatch(/<Database>/);
    }
  });
});
