import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests for Row Level Security (Task 9.3).
 *
 * Validates: Requirements 8.2, 8.3, 8.4
 *
 * Applies every migration under `supabase/migrations/` to a real PostgreSQL
 * database and verifies the RLS policies from 0004_rls.sql behave as designed:
 *   - anon reads ONLY `status='active'` offers (not draft/hidden/expired)  (R8.2)
 *   - anon cannot INSERT / UPDATE / DELETE offers                          (R8.3)
 *   - anon cannot read telegram_updates / admin_audit_logs / offer_clicks  (R8.4)
 *   - an admin (email in admin_allowlist, simulated via JWT claims) reads all (R8.6)
 *
 * ---------------------------------------------------------------------------
 * APPROACH — simulating Supabase roles/claims on a plain Postgres
 * ---------------------------------------------------------------------------
 * Supabase relies on three things this suite reproduces locally:
 *   1. Roles `anon` and `authenticated`. The migration self-bootstraps them when
 *      missing (no-op on real Supabase), so they exist after `applyMigrations`.
 *   2. `auth.jwt()` reading the verified JWT claims. On a vanilla Postgres the
 *      migration installs an equivalent that reads the `request.jwt.claims` GUC
 *      (the exact mechanism Supabase/PostgREST use). A test "logs in" by setting
 *      that GUC with `set_config('request.jwt.claims', '{"email":"..."}', true)`
 *      and switching role with `set local role authenticated`.
 *   3. Table privileges. Supabase GRANTs broad table privileges to anon/
 *      authenticated and lets RLS decide which ROWS are visible. We grant the
 *      same privileges here so the access decision under test is RLS, not a
 *      missing GRANT. With the privilege present, a denied write surfaces as an
 *      RLS error (INSERT) or as zero affected rows (UPDATE/DELETE), and a denied
 *      read surfaces as zero rows (not "permission denied").
 *
 * The suite is SKIPPED unless `TEST_DATABASE_URL` is set, so the default
 * `npm test` stays green where no database is available. Point it at a THROWAWAY
 * database with a SUPERUSER/owner connection (so `set role` is permitted):
 *
 *   docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
 *   # PowerShell
 *   $env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
 *   npm test
 *
 * Seed rows are tagged with a per-run suffix and removed in `afterAll`, so the
 * suite is safe to re-run against a shared database.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// "permission denied" and "new row violates row-level security policy" share this
// SQLSTATE; we grant table privileges first so a thrown error here means RLS.
const SQLSTATE_INSUFFICIENT_PRIVILEGE = "42501";

const AUTHORIZED_CHAT_ID = 5054325626;

// Per-run suffix so repeated runs against a shared DB never collide.
const RUN = Date.now().toString(36);
const ADMIN_EMAIL = `rls-admin-${RUN}@example.com`;

type OfferStatus = "active" | "draft" | "hidden" | "expired";

interface SeedOffer {
  readonly slug: string;
  readonly status: OfferStatus;
}

const SEED_OFFERS: ReadonlyArray<SeedOffer> = [
  { slug: `rls-active-${RUN}`, status: "active" },
  { slug: `rls-draft-${RUN}`, status: "draft" },
  { slug: `rls-hidden-${RUN}`, status: "hidden" },
  { slug: `rls-expired-${RUN}`, status: "expired" },
];
const SEED_SLUGS: ReadonlyArray<string> = SEED_OFFERS.map((o) => o.slug);
const ACTIVE_SLUG = `rls-active-${RUN}`;

// Distinct, stable identifiers for the seeded rows (bigint-safe).
const ID_BASE = Date.now();
const SEED_UPDATE_ID = ID_BASE + 900;
const ADMIN_CLAIMS = JSON.stringify({ email: ADMIN_EMAIL });

interface PgErrorShape {
  readonly code?: string;
  readonly message: string;
}

/** Narrow an unknown thrown value to the PG error fields we assert on. */
function asPgError(error: unknown): PgErrorShape {
  if (error !== null && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : String(error),
    };
  }
  return { message: String(error) };
}

/** Run a query and return the PG error it raised, or `null` if it succeeded. */
async function captureQueryError(
  client: Client,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<PgErrorShape | null> {
  try {
    await client.query(sql, params as unknown[]);
    return null;
  } catch (error) {
    return asPgError(error);
  }
}

/** Read and apply every migration file, in lexicographic (numeric) order. */
async function applyMigrations(client: Client): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, "..", "..", "supabase", "migrations");
  const entries = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const name of entries) {
    const sql = await readFile(join(migrationsDir, name), "utf8");
    await client.query(sql);
  }
}

/**
 * Grant the same broad table privileges Supabase grants to `anon`/`authenticated`,
 * so the access decision under test is RLS (rows), not a missing GRANT (privilege).
 */
async function grantSupabaseLikePrivileges(client: Client): Promise<void> {
  await client.query("grant usage on schema public to anon, authenticated");
  // Full CRUD on offers for both roles: RLS — not privilege — must block anon writes.
  await client.query("grant select, insert, update, delete on public.offers to anon, authenticated");
  // Read privilege on the sensitive tables for both roles: RLS must still deny anon.
  await client.query(
    "grant select on public.telegram_updates, public.admin_audit_logs, public.offer_clicks, public.offer_categories, public.admin_allowlist to anon, authenticated",
  );
}

/** Seed committed fixtures (as the owner/superuser, bypassing RLS). */
async function seedFixtures(client: Client): Promise<void> {
  await client.query("insert into public.admin_allowlist (email) values ($1) on conflict do nothing", [
    ADMIN_EMAIL,
  ]);

  for (let i = 0; i < SEED_OFFERS.length; i += 1) {
    const offer = SEED_OFFERS[i];
    const affiliateUrl =
      offer.status === "active"
        ? "https://www.amazon.com.mx/dp/B08ABCDEFG?tag=programadormx-20"
        : null;
    await client.query(
      `insert into public.offers
         (platform, merchant, fingerprint, telegram_chat_id, telegram_message_id,
          telegram_update_id, title, slug, current_price, status, affiliate_url, published_at)
       values ($1::platform_t, $2, $3, $4, $5, $6, $7, $8, $9, $10::offer_status, $11, now())`,
      [
        "amazon",
        "Amazon Mexico",
        `fp-rls-${RUN}-${i}`,
        AUTHORIZED_CHAT_ID,
        ID_BASE + i,
        ID_BASE + 100 + i,
        `Oferta RLS ${offer.status}`,
        offer.slug,
        100,
        offer.status,
        affiliateUrl,
      ],
    );
  }

  // A row in each sensitive table so "anon sees 0 rows" proves RLS filtering,
  // not mere emptiness. offer_clicks references the active offer.
  await client.query(
    `insert into public.telegram_updates (update_id, message_id, chat_id, update_type, payload, processing_status)
     values ($1, $2, $3, 'message', '{}'::jsonb, 'processed')
     on conflict (update_id) do nothing`,
    [SEED_UPDATE_ID, ID_BASE, AUTHORIZED_CHAT_ID],
  );
  await client.query(
    "insert into public.admin_audit_logs (actor_email, action, details) values ($1, 'seed', '{}'::jsonb)",
    [ADMIN_EMAIL],
  );
  await client.query(
    `insert into public.offer_clicks (offer_id, source, referrer_domain)
     select id, 'card', 'example.com' from public.offers where slug = $1`,
    [ACTIVE_SLUG],
  );
}

/** Remove every committed fixture this run created. */
async function cleanupFixtures(client: Client): Promise<void> {
  await client.query("reset role");
  // Deleting the offers cascades to offer_clicks (FK on delete cascade).
  await client.query("delete from public.offers where slug = any($1)", [SEED_SLUGS]);
  await client.query("delete from public.telegram_updates where update_id = $1", [SEED_UPDATE_ID]);
  await client.query("delete from public.admin_audit_logs where actor_email = $1", [ADMIN_EMAIL]);
  await client.query("delete from public.admin_allowlist where email = $1", [ADMIN_EMAIL]);
}

describe.skipIf(!TEST_DATABASE_URL)("row level security (integration)", () => {
  const client = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await applyMigrations(client);
    await grantSupabaseLikePrivileges(client);
    await seedFixtures(client);
  });

  afterAll(async () => {
    await cleanupFixtures(client);
    await client.end();
  });

  // Each test runs in its own transaction; `set local role` / claims are scoped to
  // it and the rollback restores the owner role and clears the simulated session.
  beforeEach(async () => {
    await client.query("begin");
  });
  afterEach(async () => {
    await client.query("rollback");
  });

  /** Become the anonymous visitor (Supabase `anon`) for the rest of the txn. */
  async function becomeAnon(): Promise<void> {
    await client.query("set local role anon");
  }

  /** Become the authenticated admin, presenting the admin email as a JWT claim. */
  async function becomeAdmin(): Promise<void> {
    await client.query("select set_config('request.jwt.claims', $1, true)", [ADMIN_CLAIMS]);
    await client.query("set local role authenticated");
  }

  describe("public visitor reads only active offers (R8.2)", () => {
    it("returns the active offer and hides draft/hidden/expired ones", async () => {
      await becomeAnon();
      const result = await client.query<{ slug: string; status: string }>(
        "select slug, status from public.offers where slug = any($1)",
        [SEED_SLUGS],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.status).toBe("active");
      expect(result.rows[0]?.slug).toBe(ACTIVE_SLUG);
    });
  });

  describe("public visitor cannot write offers (R8.3)", () => {
    it("rejects an INSERT with an RLS violation", async () => {
      await becomeAnon();
      const error = await captureQueryError(
        client,
        `insert into public.offers
           (platform, merchant, fingerprint, telegram_chat_id, telegram_message_id,
            telegram_update_id, title, slug, current_price, status)
         values ('amazon'::platform_t, 'Amazon Mexico', $1, $2, $3, $4, 'Intruso', $5, 10, 'draft'::offer_status)`,
        [`fp-anon-${RUN}`, AUTHORIZED_CHAT_ID, ID_BASE + 500, ID_BASE + 600, `anon-insert-${RUN}`],
      );
      expect(error?.code).toBe(SQLSTATE_INSUFFICIENT_PRIVILEGE);
    });

    it("affects zero rows on UPDATE and leaves the active offer unchanged", async () => {
      await becomeAnon();
      const update = await client.query(
        "update public.offers set title = 'hackeado' where slug = $1",
        [ACTIVE_SLUG],
      );
      expect(update.rowCount).toBe(0);

      await client.query("reset role");
      const check = await client.query<{ title: string }>(
        "select title from public.offers where slug = $1",
        [ACTIVE_SLUG],
      );
      expect(check.rows[0]?.title).not.toBe("hackeado");
    });

    it("affects zero rows on DELETE and leaves the active offer present", async () => {
      await becomeAnon();
      const del = await client.query("delete from public.offers where slug = $1", [ACTIVE_SLUG]);
      expect(del.rowCount).toBe(0);

      await client.query("reset role");
      const check = await client.query("select 1 from public.offers where slug = $1", [ACTIVE_SLUG]);
      expect(check.rowCount).toBe(1);
    });
  });

  describe("public visitor cannot read private tables (R8.4)", () => {
    it("sees zero rows in telegram_updates despite a seeded row", async () => {
      await becomeAnon();
      const result = await client.query("select * from public.telegram_updates");
      expect(result.rowCount).toBe(0);
    });

    it("sees zero rows in admin_audit_logs despite a seeded row", async () => {
      await becomeAnon();
      const result = await client.query("select * from public.admin_audit_logs");
      expect(result.rowCount).toBe(0);
    });

    it("sees zero rows in offer_clicks despite a seeded row", async () => {
      await becomeAnon();
      const result = await client.query("select * from public.offer_clicks");
      expect(result.rowCount).toBe(0);
    });
  });

  describe("admin reads everything (R8.6)", () => {
    it("sees all seeded offers regardless of status", async () => {
      await becomeAdmin();
      const result = await client.query<{ status: string }>(
        "select status from public.offers where slug = any($1)",
        [SEED_SLUGS],
      );
      const statuses = result.rows.map((r) => r.status).sort();
      expect(statuses).toEqual(["active", "draft", "expired", "hidden"]);
    });

    it("can read the private tables denied to anon", async () => {
      await becomeAdmin();
      const updates = await client.query("select 1 from public.telegram_updates where update_id = $1", [
        SEED_UPDATE_ID,
      ]);
      expect(updates.rowCount).toBe(1);

      const audit = await client.query("select 1 from public.admin_audit_logs where actor_email = $1", [
        ADMIN_EMAIL,
      ]);
      expect(audit.rowCount).toBe(1);

      const clicks = await client.query("select 1 from public.offer_clicks");
      expect(clicks.rowCount).toBeGreaterThanOrEqual(1);
    });
  });
});
