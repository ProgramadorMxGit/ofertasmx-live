import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests for the database schema constraints (Task 8.4).
 *
 * Validates: Requirements 6.4, 6.6, 6.7, 6.8
 *
 * These tests apply the versioned SQL migrations under `supabase/migrations/`
 * to a real PostgreSQL database and assert that the integrity constraints
 * behave as designed:
 *   - price/status CHECKs reject bad rows         (R6.7, R6.3)
 *   - `slug` is unique                            (R6.4)
 *   - (telegram_chat_id, telegram_message_id) is unique within the chat (R6.6)
 *   - an `active` offer requires an `affiliate_url`(R6.8)
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN AGAINST A LOCAL POSTGRES
 * ---------------------------------------------------------------------------
 * This suite is SKIPPED unless `TEST_DATABASE_URL` is set, so the default
 * `npm test` stays green in environments without a database. Point it at a
 * THROWAWAY database (the test creates/uses objects in the `public` schema):
 *
 *   1. Start a disposable Postgres (Docker):
 *        docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
 *
 *   2. Export the connection string and run the suite:
 *        # PowerShell
 *        $env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
 *        # bash / zsh
 *        export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"
 *
 *        npm test
 *
 * For a managed host that requires TLS, append `?sslmode=require` to the URL.
 * The migrations are idempotent-friendly, so re-applying them is safe; every
 * test runs inside a transaction that is rolled back, leaving no test data.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// PostgreSQL SQLSTATE codes asserted by these tests.
const SQLSTATE = {
  notNullViolation: "23502",
  checkViolation: "23514",
  uniqueViolation: "23505",
  invalidTextRepresentation: "22P02", // bad enum value
} as const;

/** Narrow an unknown thrown value to the PG error fields we assert on. */
function asPgError(error: unknown): { code?: string; constraint?: string; message: string } {
  if (error !== null && typeof error === "object") {
    const e = error as { code?: unknown; constraint?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      constraint: typeof e.constraint === "string" ? e.constraint : undefined,
      message: typeof e.message === "string" ? e.message : String(error),
    };
  }
  return { message: String(error) };
}

/** Run a query and return the PG error it raised, or `null` if it succeeded. */
async function captureQueryError(
  client: Client,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<{ code?: string; constraint?: string; message: string } | null> {
  try {
    await client.query(sql, params as unknown[]);
    return null;
  } catch (error) {
    return asPgError(error);
  }
}

// Monotonic counters so generated identities never collide within a run.
let counter = 0;
function uid(): number {
  counter += 1;
  return counter;
}
function tag(): string {
  return `${Date.now().toString(36)}-${uid()}`;
}

const AUTHORIZED_CHAT_ID = 5054325626;

interface OfferOverrides {
  readonly slug?: string;
  readonly fingerprint?: string;
  readonly telegram_chat_id?: number;
  readonly telegram_message_id?: number;
  readonly telegram_update_id?: number;
  readonly current_price?: number;
  readonly original_price?: number | null;
  readonly discount_percent?: number | null;
  readonly status?: string;
  readonly affiliate_url?: string | null;
}

const INSERT_OFFER_SQL = `
  insert into public.offers
    (platform, merchant, fingerprint, telegram_chat_id, telegram_message_id,
     telegram_update_id, title, slug, current_price, original_price,
     discount_percent, status, affiliate_url)
  values
    ($1::platform_t, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::offer_status, $13)
`;

/** Build the parameter list for `INSERT_OFFER_SQL` from sensible valid defaults. */
function offerParams(overrides: OfferOverrides = {}): unknown[] {
  const suffix = tag();
  return [
    "amazon", // platform
    "Amazon Mexico", // merchant
    overrides.fingerprint ?? `fp-${suffix}`, // fingerprint
    overrides.telegram_chat_id ?? AUTHORIZED_CHAT_ID, // telegram_chat_id
    overrides.telegram_message_id ?? uid(), // telegram_message_id
    overrides.telegram_update_id ?? uid(), // telegram_update_id
    "Producto de prueba", // title
    overrides.slug ?? `producto-${suffix}`, // slug
    overrides.current_price ?? 100, // current_price
    overrides.original_price ?? null, // original_price
    overrides.discount_percent ?? null, // discount_percent
    overrides.status ?? "draft", // status
    overrides.affiliate_url ?? null, // affiliate_url
  ];
}

function insertOffer(client: Client, overrides: OfferOverrides = {}): Promise<unknown> {
  return client.query(INSERT_OFFER_SQL, offerParams(overrides));
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

describe.skipIf(!TEST_DATABASE_URL)("database schema constraints (integration)", () => {
  const client = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await applyMigrations(client);
  });

  afterAll(async () => {
    await client.end();
  });

  // Each test runs in its own transaction and is rolled back, so no row created
  // here persists and uniqueness checks across tests stay independent.
  beforeEach(async () => {
    await client.query("begin");
  });
  afterEach(async () => {
    await client.query("rollback");
  });

  describe("price CHECK constraints (R6.7)", () => {
    it("accepts a valid offer with non-negative prices", async () => {
      const error = await captureQueryError(client, INSERT_OFFER_SQL, offerParams());
      expect(error).toBeNull();
    });

    it("rejects a negative current_price", async () => {
      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        offerParams({ current_price: -1 }),
      );
      expect(error?.code).toBe(SQLSTATE.checkViolation);
      expect(error?.constraint).toBe("offers_current_price_nonneg");
    });

    it("rejects a discount_percent above 100", async () => {
      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        offerParams({ original_price: 200, current_price: 100, discount_percent: 150 }),
      );
      expect(error?.code).toBe(SQLSTATE.checkViolation);
      expect(error?.constraint).toBe("offers_discount_percent_range");
    });

    it("rejects an original_price that is not greater than current_price", async () => {
      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        offerParams({ original_price: 100, current_price: 100 }),
      );
      expect(error?.code).toBe(SQLSTATE.checkViolation);
      expect(error?.constraint).toBe("price_relationship");
    });
  });

  describe("status domain (R6.3)", () => {
    it("rejects a status value outside the offer_status enum", async () => {
      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        offerParams({ status: "bogus" }),
      );
      expect(error?.code).toBe(SQLSTATE.invalidTextRepresentation);
    });
  });

  describe("slug uniqueness (R6.4)", () => {
    it("rejects a duplicate slug", async () => {
      const slug = `dup-slug-${tag()}`;
      await insertOffer(client, { slug });

      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        // Different chat/message so only the slug index can trip.
        offerParams({ slug, telegram_message_id: uid(), telegram_update_id: uid() }),
      );
      expect(error?.code).toBe(SQLSTATE.uniqueViolation);
      expect(error?.constraint).toBe("offers_slug_key");
    });
  });

  describe("(telegram_chat_id, telegram_message_id) uniqueness (R6.6)", () => {
    it("rejects a duplicate (chat_id, message_id) pair within the authorized chat", async () => {
      const messageId = uid();
      await insertOffer(client, {
        telegram_chat_id: AUTHORIZED_CHAT_ID,
        telegram_message_id: messageId,
      });

      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        // Different slug so only the (chat_id, message_id) index can trip.
        offerParams({
          telegram_chat_id: AUTHORIZED_CHAT_ID,
          telegram_message_id: messageId,
        }),
      );
      expect(error?.code).toBe(SQLSTATE.uniqueViolation);
      expect(error?.constraint).toBe("offers_chat_message_key");
    });
  });

  describe("active offer requires affiliate_url (R6.8)", () => {
    it("rejects an active offer without an affiliate_url", async () => {
      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        offerParams({ status: "active", affiliate_url: null }),
      );
      expect(error?.code).toBe(SQLSTATE.checkViolation);
      expect(error?.constraint).toBe("active_requires_affiliate");
    });

    it("accepts an active offer that has an affiliate_url", async () => {
      const error = await captureQueryError(
        client,
        INSERT_OFFER_SQL,
        offerParams({
          status: "active",
          affiliate_url: "https://www.amazon.com.mx/dp/B08ABCDEFG?tag=programadormx-20",
        }),
      );
      expect(error).toBeNull();
    });
  });
});
