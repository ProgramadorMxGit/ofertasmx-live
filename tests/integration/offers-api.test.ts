import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  compareOffersForSort,
  orderKeysForSort,
  type OfferOrderFields,
  type OrderKey,
} from "@/lib/offers/query";

/**
 * Integration tests for the public offers query (Task 18.2).
 * Validates: Requirements 16.1, 16.2
 *
 * Exercises filter combinations and keyset pagination stability against a REAL
 * Postgres with every migration applied, using the same order keys the route
 * uses (`orderKeysForSort`). It checks two things the pure unit test cannot:
 *   - the in-memory comparator (`compareOffersForSort`) matches the DB ORDER BY;
 *   - keyset paging built from those keys reconstructs the full ordered list
 *     with no gaps or duplicates.
 *
 * SKIPPED unless `TEST_DATABASE_URL` is set (point it at a THROWAWAY database):
 *   docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
 *   $env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const AUTHORIZED_CHAT_ID = 5054325626;
const RUN = Date.now().toString(36);

type Status = "active" | "draft" | "hidden" | "expired";

interface SeedOffer {
  readonly tag: string;
  readonly platform: "amazon" | "mercado_libre";
  readonly status: Status;
  readonly discount: number | null;
  readonly price: number;
  readonly original: number | null;
  /** Minutes subtracted from a base time so published_at is distinct + ordered. */
  readonly ageMinutes: number;
  readonly category: "electronica" | null;
}

// 9 active (incl. a NULL-discount tail row and a discount tie at 30) + 3 inactive.
const SEED_OFFERS: ReadonlyArray<SeedOffer> = [
  { tag: "a1", platform: "amazon", status: "active", discount: 70, price: 500, original: 1000, ageMinutes: 1, category: "electronica" },
  { tag: "a2", platform: "amazon", status: "active", discount: 60, price: 800, original: 2000, ageMinutes: 2, category: "electronica" },
  { tag: "a3", platform: "mercado_libre", status: "active", discount: 50, price: 250, original: 500, ageMinutes: 3, category: "electronica" },
  { tag: "a4", platform: "mercado_libre", status: "active", discount: 30, price: 700, original: 1000, ageMinutes: 4, category: null },
  { tag: "a5", platform: "amazon", status: "active", discount: 30, price: 900, original: 1300, ageMinutes: 5, category: null },
  { tag: "a6", platform: "amazon", status: "active", discount: 20, price: 1200, original: 1500, ageMinutes: 6, category: null },
  { tag: "a7", platform: "mercado_libre", status: "active", discount: 10, price: 1500, original: 1700, ageMinutes: 7, category: null },
  { tag: "a8", platform: "amazon", status: "active", discount: 5, price: 2000, original: 2100, ageMinutes: 8, category: null },
  { tag: "a9", platform: "mercado_libre", status: "active", discount: null, price: 300, original: null, ageMinutes: 9, category: null },
  { tag: "x1", platform: "amazon", status: "draft", discount: 80, price: 100, original: 500, ageMinutes: 10, category: null },
  { tag: "x2", platform: "amazon", status: "hidden", discount: 80, price: 100, original: 500, ageMinutes: 11, category: null },
  { tag: "x3", platform: "mercado_libre", status: "expired", discount: 80, price: 100, original: 500, ageMinutes: 12, category: null },
];

const ACTIVE_TAGS = SEED_OFFERS.filter((o) => o.status === "active").map((o) => o.tag);
const ID_BASE = Date.now();
const CATEGORY_SLUG = `electronica-${RUN}`;

interface OfferRow {
  readonly id: string;
  readonly tag: string;
  readonly published_at: Date;
  readonly discount_percent: number | null;
  readonly current_price: string; // pg returns numeric as string
}

/** Normalize a DB row to the order fields shape the comparator expects. */
function toOrderFields(row: OfferRow): OfferOrderFields {
  return {
    id: row.id,
    published_at: row.published_at.toISOString(),
    discount_percent: row.discount_percent,
    current_price: Number(row.current_price),
  };
}

const SELECT_COLS =
  "id, raw_text as tag, published_at, discount_percent, current_price";

function orderByClause(keys: readonly OrderKey[]): string {
  return keys
    .map(
      (k) =>
        `${k.column} ${k.ascending ? "asc" : "desc"} nulls ${k.nullsFirst ? "first" : "last"}`,
    )
    .join(", ");
}

/** Keyset WHERE built from the same order keys the route uses (1-based params). */
function keysetWhere(
  keys: readonly [OrderKey, OrderKey],
  last: OfferOrderFields,
): { sql: string; params: unknown[] } {
  const [primary, tie] = keys;
  const pOp = primary.ascending ? ">" : "<";
  const tOp = tie.ascending ? ">" : "<";
  const pValue =
    primary.column === "published_at"
      ? last.published_at
      : primary.column === "discount_percent"
        ? last.discount_percent
        : last.current_price;
  const tValue = last.id;

  if (pValue === null) {
    return {
      sql: `(${primary.column} is null and ${tie.column} ${tOp} $1)`,
      params: [tValue],
    };
  }
  const parts = [`${primary.column} ${pOp} $1`];
  if (primary.nullable && !primary.ascending) parts.push(`${primary.column} is null`);
  parts.push(`(${primary.column} = $1 and ${tie.column} ${tOp} $2)`);
  return { sql: `(${parts.join(" or ")})`, params: [pValue, tValue] };
}

async function applyMigrations(client: Client): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, "..", "..", "supabase", "migrations");
  const entries = (await readdir(migrationsDir)).filter((n) => n.endsWith(".sql")).sort();
  for (const name of entries) {
    await client.query(await readFile(join(migrationsDir, name), "utf8"));
  }
}

async function seed(client: Client): Promise<string> {
  const category = await client.query<{ id: string }>(
    "insert into public.offer_categories (slug, name) values ($1, 'Electronica') returning id",
    [CATEGORY_SLUG],
  );
  const categoryId = category.rows[0]?.id ?? null;

  for (let i = 0; i < SEED_OFFERS.length; i += 1) {
    const o = SEED_OFFERS[i];
    await client.query(
      `insert into public.offers
         (platform, merchant, fingerprint, telegram_chat_id, telegram_message_id,
          telegram_update_id, title, slug, current_price, original_price, discount_percent,
          status, affiliate_url, category_id, raw_text, published_at)
       values ($1::platform_t, 'M', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::offer_status, $12, $13,
               $14, now() - ($15 || ' minutes')::interval)`,
      [
        o.platform,
        `fp-oa-${RUN}-${i}`,
        AUTHORIZED_CHAT_ID,
        ID_BASE + i,
        ID_BASE + 100 + i,
        `Oferta ${o.tag}`,
        `oa-${RUN}-${o.tag}`,
        o.price,
        o.original,
        o.discount,
        o.status,
        o.status === "active" ? "https://www.amazon.com.mx/dp/B00ABCDEFG?tag=programadormx-20" : null,
        o.category === "electronica" ? categoryId : null,
        o.tag,
        String(o.ageMinutes),
      ],
    );
  }
  return categoryId ?? "";
}

async function cleanup(client: Client): Promise<void> {
  await client.query("delete from public.offers where slug like $1", [`oa-${RUN}-%`]);
  await client.query("delete from public.offer_categories where slug = $1", [CATEGORY_SLUG]);
}

describe.skipIf(!TEST_DATABASE_URL)("public offers query (integration)", () => {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  let categoryId = "";

  beforeAll(async () => {
    await client.connect();
    await applyMigrations(client);
    categoryId = await seed(client);
  });

  afterAll(async () => {
    await cleanup(client);
    await client.end();
  });

  async function fetchActive(where = "", params: unknown[] = []): Promise<OfferRow[]> {
    const sql =
      `select ${SELECT_COLS} from public.offers ` +
      `where slug like $${params.length + 1} and status = 'active'` +
      (where ? ` and ${where}` : "");
    const result = await client.query<OfferRow>(sql, [...params, `oa-${RUN}-%`]);
    return result.rows;
  }

  describe("filters (R16.1, R16.2)", () => {
    it("returns only active offers (hides draft/hidden/expired)", async () => {
      const rows = await fetchActive();
      expect(rows.map((r) => r.tag).sort()).toEqual([...ACTIVE_TAGS].sort());
    });

    it("filters by platform", async () => {
      const rows = await fetchActive("platform = 'amazon'::platform_t");
      expect(rows.every((r) => r.tag.startsWith("a"))).toBe(true);
      expect(rows.map((r) => r.tag).sort()).toEqual(["a1", "a2", "a5", "a6", "a8"]);
    });

    it("filters by minimum discount", async () => {
      const rows = await fetchActive("discount_percent >= $1", [50]);
      expect(rows.map((r) => r.tag).sort()).toEqual(["a1", "a2", "a3"]);
    });

    it("filters by price range", async () => {
      const rows = await fetchActive("current_price >= $1 and current_price <= $2", [300, 900]);
      expect(rows.map((r) => r.tag).sort()).toEqual(["a2", "a3", "a4", "a5", "a9"]);
    });

    it("filters by category id", async () => {
      const rows = await fetchActive("category_id = $1", [categoryId]);
      expect(rows.map((r) => r.tag).sort()).toEqual(["a1", "a2", "a3"]);
    });
  });

  describe("ordering matches the in-memory comparator", () => {
    for (const sort of ["recent", "discount", "price_asc"] as const) {
      it(`DB ORDER BY equals compareOffersForSort for ${sort}`, async () => {
        const keys = orderKeysForSort(sort);
        const rows = await fetchActive();
        const tagById = new Map(rows.map((r) => [r.id, r.tag] as const));

        const dbRows = await client.query<OfferRow>(
          `select ${SELECT_COLS} from public.offers where slug like $1 and status='active' order by ${orderByClause(keys)}`,
          [`oa-${RUN}-%`],
        );
        const dbOrder = dbRows.rows.map((r) => r.tag);

        const jsOrder = rows
          .map(toOrderFields)
          .sort((a, b) => compareOffersForSort(a, b, sort))
          .map((f) => tagById.get(f.id) ?? "?");

        expect(jsOrder).toEqual(dbOrder);
      });
    }
  });

  describe("keyset pagination stability (R16.2)", () => {
    for (const sort of ["recent", "discount"] as const) {
      it(`reconstructs the full ordered list with no gaps/dupes for ${sort}`, async () => {
        const keys = orderKeysForSort(sort);
        const orderBy = orderByClause(keys);

        const full = await client.query<OfferRow>(
          `select ${SELECT_COLS} from public.offers where slug like $1 and status='active' order by ${orderBy}`,
          [`oa-${RUN}-%`],
        );
        const expectedTags = full.rows.map((r) => r.tag);

        const collected: string[] = [];
        let last: OfferOrderFields | null = null;
        const pageSize = 3;
        for (let guard = 0; guard < 50; guard += 1) {
          let sql = `select ${SELECT_COLS} from public.offers where slug like $1 and status='active'`;
          const params: unknown[] = [`oa-${RUN}-%`];
          if (last) {
            const ks = keysetWhere(keys, last);
            // Shift keyset params after $1 (the slug pattern).
            const shifted = ks.sql.replace(/\$(\d+)/g, (_m, n) => `$${Number(n) + 1}`);
            sql += ` and ${shifted}`;
            params.push(...ks.params);
          }
          sql += ` order by ${orderBy} limit ${pageSize}`;
          const page = await client.query<OfferRow>(sql, params);
          if (page.rows.length === 0) break;
          collected.push(...page.rows.map((r) => r.tag));
          const lastRow = page.rows[page.rows.length - 1];
          if (!lastRow) break;
          last = toOrderFields(lastRow);
          if (page.rows.length < pageSize) break;
        }

        expect(collected).toEqual(expectedTags);
        expect(new Set(collected).size).toBe(collected.length); // no duplicates
      });
    }
  });
});
