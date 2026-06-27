/**
 * Pure query builder for the public offers API (`/api/offers`, R16.1, R16.2,
 * R19.6, R10.3).
 *
 * This module is intentionally **side-effect free**: it has no Supabase, no
 * `server-only` and no network dependency, so the whole filter/sort/pagination
 * surface is unit-testable without a database. The route handler in
 * `app/api/offers/route.ts` is the only place that turns the descriptor
 * produced here into an actual (anon, RLS-scoped) Supabase query.
 *
 * Responsibilities:
 *   - validate + normalize raw `searchParams` into an {@link OffersQuery}
 *     descriptor (Zod);
 *   - map a `sort` to its keyset order keys (single source of truth used to
 *     build both the DB `ORDER BY` and the keyset predicate);
 *   - encode/decode an opaque, tamper-evident cursor;
 *   - build the PostgREST `.or()` keyset predicate for the next page.
 *
 * Keyset pagination (design "Rendimiento"): `(published_at desc, id desc)` for
 * `recent` and `(discount_percent desc, id desc)` for `discount`, leveraging the
 * partial indexes `where status='active'`. `price_asc` keysets over
 * `(current_price asc, id asc)`.
 */

import { z } from "zod";

import type { Tables } from "@/lib/supabase/types";

/** Supported list orderings (R16.2: más recientes, mayor descuento, menor precio). */
export const OFFER_SORTS = ["recent", "discount", "price_asc"] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];

/** Platform filter values (R16.1). */
export const OFFER_PLATFORMS = ["amazon", "mercado_libre"] as const;
export type OfferPlatform = (typeof OFFER_PLATFORMS)[number];

export const DEFAULT_OFFERS_LIMIT = 24;
export const MAX_OFFERS_LIMIT = 48;
/** Generous upper bound for a price filter (MXN); keeps coercion sane. */
export const MAX_PRICE = 99_999_999;

/** Slug shape shared with `lib/dedup/slug.ts`: lowercase alphanumerics + hyphens. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a canonical UUID (used to 404 fast on malformed ids). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Public projection — never leak ingestion/internal columns to the browser.
// ---------------------------------------------------------------------------

/**
 * Columns safe to expose publicly. RLS restricts which *rows* anon can read
 * (only `status='active'`); this list restricts which *columns* leave the
 * server, deliberately omitting `fingerprint`, `raw_text`, the `telegram_*`
 * ids, `affiliate_tag`, `image_storage_path` and `needs_review`.
 */
export const PUBLIC_OFFER_COLUMN_LIST = [
  "id",
  "platform",
  "merchant",
  "external_product_id",
  "title",
  "slug",
  "short_description",
  "editorial_summary",
  "image_url",
  "image_alt",
  "image_status",
  "original_price",
  "current_price",
  "discount_percent",
  "currency",
  "affiliate_url",
  "category_id",
  "status",
  "is_featured",
  "published_at",
  "updated_at",
  "last_verified_at",
  "expires_at",
  "created_at",
] as const;

/** Comma-separated column list for a Supabase `.select(...)`. */
export const PUBLIC_OFFER_COLUMNS = PUBLIC_OFFER_COLUMN_LIST.join(", ");

/** A single offer as returned by the public API. */
export type PublicOffer = Pick<
  Tables<"offers">,
  (typeof PUBLIC_OFFER_COLUMN_LIST)[number]
>;

// ---------------------------------------------------------------------------
// Order keys — the single source of truth for ordering + keyset + cursor.
// ---------------------------------------------------------------------------

export type OrderColumn =
  | "published_at"
  | "discount_percent"
  | "current_price"
  | "id";

export interface OrderKey {
  readonly column: OrderColumn;
  readonly ascending: boolean;
  /** How Postgres places NULLs for this key (also drives keyset null handling). */
  readonly nullsFirst: boolean;
  /** Whether this column can hold NULL in practice (only `discount_percent`). */
  readonly nullable: boolean;
}

/**
 * Each sort is exactly two keys: a primary key plus the `id` tiebreaker (a
 * unique, non-null total-order key) so pagination is deterministic.
 *
 * `recent` matches the `offers_active_recent_idx (published_at desc, id desc)`
 * partial index (NULLS FIRST, harmless since active offers always have a
 * `published_at`). `discount` orders NULLS LAST so offers without a computed
 * discount fall to the end of the "mayor descuento" view.
 */
const ORDER_KEYS: Record<OfferSort, readonly [OrderKey, OrderKey]> = {
  recent: [
    { column: "published_at", ascending: false, nullsFirst: true, nullable: false },
    { column: "id", ascending: false, nullsFirst: true, nullable: false },
  ],
  discount: [
    { column: "discount_percent", ascending: false, nullsFirst: false, nullable: true },
    { column: "id", ascending: false, nullsFirst: false, nullable: false },
  ],
  price_asc: [
    { column: "current_price", ascending: true, nullsFirst: false, nullable: false },
    { column: "id", ascending: true, nullsFirst: false, nullable: false },
  ],
};

/** The ordered keys (primary, tiebreaker) for a sort. */
export function orderKeysForSort(sort: OfferSort): readonly [OrderKey, OrderKey] {
  return ORDER_KEYS[sort];
}

// ---------------------------------------------------------------------------
// Cursor — opaque base64url(JSON) carrying the sort + the order-key values.
// ---------------------------------------------------------------------------

export type CursorValue = string | number | null;

export interface OffersCursor {
  readonly sort: OfferSort;
  readonly values: readonly CursorValue[];
}

/** Minimal row shape needed to derive ordering, keyset and cursor values. */
export interface OfferOrderFields {
  readonly id: string;
  readonly published_at: string | null;
  readonly discount_percent: number | null;
  readonly current_price: number;
}

function readOrderField(row: OfferOrderFields, column: OrderColumn): CursorValue {
  switch (column) {
    case "published_at":
      return row.published_at;
    case "discount_percent":
      return row.discount_percent;
    case "current_price":
      return row.current_price;
    case "id":
      return row.id;
  }
}

const cursorPayloadSchema = z.object({
  s: z.enum(OFFER_SORTS),
  v: z.array(z.union([z.string(), z.number(), z.null()])).min(1).max(4),
});

/** Encode an opaque cursor from a sort and its aligned order-key values. */
export function encodeCursor(sort: OfferSort, values: readonly CursorValue[]): string {
  const json = JSON.stringify({ s: sort, v: values });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Encode the cursor pointing *after* `row` for the given sort. */
export function encodeCursorForRow(sort: OfferSort, row: OfferOrderFields): string {
  const values = orderKeysForSort(sort).map((key) => readOrderField(row, key.column));
  return encodeCursor(sort, values);
}

/**
 * Decode an opaque cursor. Returns `null` for anything malformed (bad base64,
 * bad JSON, wrong shape, or a value-count that does not match the sort's keys),
 * so a tampered cursor is rejected rather than trusted.
 */
export function decodeCursor(raw: string): OffersCursor | null {
  let json: string;
  try {
    json = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    return null;
  }
  const result = cursorPayloadSchema.safeParse(parsedJson);
  if (!result.success) return null;
  if (result.data.v.length !== orderKeysForSort(result.data.s).length) return null;
  return { sort: result.data.s, values: result.data.v };
}

// ---------------------------------------------------------------------------
// Query descriptor — validated, normalized filter/sort/pagination params.
// ---------------------------------------------------------------------------

export interface OffersQuery {
  readonly platform?: OfferPlatform;
  readonly categorySlug?: string;
  readonly minDiscount?: number;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly sort: OfferSort;
  readonly limit: number;
  readonly cursor: OffersCursor | null;
}

export type ParseResult =
  | { readonly success: true; readonly query: OffersQuery }
  | { readonly success: false; readonly error: string };

const rawQuerySchema = z
  .object({
    platform: z.enum(OFFER_PLATFORMS).optional(),
    category: z.string().trim().min(1).max(64).regex(SLUG_RE).optional(),
    minDiscount: z.coerce.number().int().min(0).max(100).optional(),
    minPrice: z.coerce.number().min(0).max(MAX_PRICE).optional(),
    maxPrice: z.coerce.number().min(0).max(MAX_PRICE).optional(),
    sort: z.enum(OFFER_SORTS).default("recent"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_OFFERS_LIMIT)
      .default(DEFAULT_OFFERS_LIMIT),
    cursor: z.string().min(1).max(512).optional(),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    { message: "minPrice no puede ser mayor que maxPrice", path: ["minPrice"] },
  );

/** Drop absent/blank params so `?minPrice=` is treated as "not provided". */
function toRecord(
  input: URLSearchParams | Record<string, string | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const entries: Iterable<readonly [string, string | null | undefined]> =
    input instanceof URLSearchParams ? input.entries() : Object.entries(input);
  for (const [key, value] of entries) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) out[key] = trimmed;
    }
  }
  return out;
}

/**
 * Validate + normalize raw search params into an {@link OffersQuery}.
 *
 * Returns a discriminated result rather than throwing, so the route can map a
 * failure straight to a 400. A `cursor` that decodes but does not match the
 * requested `sort` is rejected (pagination must stay on a single ordering).
 */
export function safeParseOffersQuery(
  input: URLSearchParams | Record<string, string | null | undefined>,
): ParseResult {
  const parsed = rawQuerySchema.safeParse(toRecord(input));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { success: false, error: issue?.message ?? "parámetros inválidos" };
  }
  const data = parsed.data;

  let cursor: OffersCursor | null = null;
  if (data.cursor !== undefined) {
    const decoded = decodeCursor(data.cursor);
    if (!decoded) return { success: false, error: "cursor inválido" };
    if (decoded.sort !== data.sort) {
      return { success: false, error: "el cursor no corresponde al orden solicitado" };
    }
    cursor = decoded;
  }

  return {
    success: true,
    query: {
      platform: data.platform,
      categorySlug: data.category,
      minDiscount: data.minDiscount,
      minPrice: data.minPrice,
      maxPrice: data.maxPrice,
      sort: data.sort,
      limit: data.limit,
      cursor,
    },
  };
}

// ---------------------------------------------------------------------------
// Keyset predicate — PostgREST `.or()` expression for "rows after the cursor".
// ---------------------------------------------------------------------------

function formatFilterValue(value: string | number): string {
  if (typeof value === "number") return String(value);
  // Quote string values (timestamptz, uuid) and strip PostgREST-reserved chars
  // so a value can never be parsed as an operator/delimiter. Our real values
  // (ISO timestamps, UUIDs) contain none of these, so this is purely defensive.
  const sanitized = value.replace(/["(),]/g, "");
  return `"${sanitized}"`;
}

/**
 * Build the PostgREST `.or(...)` expression selecting rows strictly *after* the
 * cursor in the sort's order. Returns `undefined` when there is no cursor (the
 * first page needs no keyset predicate).
 *
 * For a descending nullable primary ordered NULLS LAST (`discount`), the NULL
 * group sorts after every non-null value, so a non-null cursor also admits NULL
 * rows, and a NULL cursor paginates within the trailing NULL group by id.
 */
export function buildKeysetFilter(query: OffersQuery): string | undefined {
  const cursor = query.cursor;
  if (!cursor) return undefined;

  const [primary, tiebreak] = orderKeysForSort(query.sort);
  const primaryValue = cursor.values[0] ?? null;
  const tiebreakValue = cursor.values[1];
  // The tiebreaker is always the offer id (a UUID string); anything else is a
  // malformed cursor we decline to translate into a predicate.
  if (typeof tiebreakValue !== "string") return undefined;

  const tieAfter = tiebreak.ascending ? "gt" : "lt";
  const tieVal = formatFilterValue(tiebreakValue);

  if (primaryValue === null) {
    // Inside the trailing NULL group (only reachable for a nullable primary):
    // order by the tiebreaker alone.
    return `and(${primary.column}.is.null,${tiebreak.column}.${tieAfter}.${tieVal})`;
  }

  const primAfter = primary.ascending ? "gt" : "lt";
  const primVal = formatFilterValue(primaryValue);
  const clauses: string[] = [`${primary.column}.${primAfter}.${primVal}`];
  if (primary.nullable && !primary.ascending) {
    clauses.push(`${primary.column}.is.null`);
  }
  clauses.push(
    `and(${primary.column}.eq.${primVal},${tiebreak.column}.${tieAfter}.${tieVal})`,
  );
  return clauses.join(",");
}

// ---------------------------------------------------------------------------
// In-memory order model — mirrors the DB ordering for deterministic tests.
// ---------------------------------------------------------------------------

function compareValues(a: CursorValue, b: CursorValue, key: OrderKey): number {
  if (a === null && b === null) return 0;
  if (a === null) return key.nullsFirst ? -1 : 1;
  if (b === null) return key.nullsFirst ? 1 : -1;

  let base: number;
  if (typeof a === "number" && typeof b === "number") {
    base = a < b ? -1 : a > b ? 1 : 0;
  } else {
    const as = String(a);
    const bs = String(b);
    base = as < bs ? -1 : as > bs ? 1 : 0;
  }
  return key.ascending ? base : -base;
}

/**
 * Total order matching the DB `ORDER BY` for a sort. Negative when `a` should
 * appear before `b` in the rendered list. Shared by tests to verify that keyset
 * pagination is a stable, gap-free partition of this exact ordering.
 */
export function compareOffersForSort(
  a: OfferOrderFields,
  b: OfferOrderFields,
  sort: OfferSort,
): number {
  for (const key of orderKeysForSort(sort)) {
    const cmp = compareValues(
      readOrderField(a, key.column),
      readOrderField(b, key.column),
      key,
    );
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** Reconstruct the order-relevant fields encoded in a cursor. */
export function cursorToOrderFields(cursor: OffersCursor): OfferOrderFields {
  const fields = {
    id: "",
    published_at: null as string | null,
    discount_percent: null as number | null,
    current_price: 0,
  };
  orderKeysForSort(cursor.sort).forEach((key, index) => {
    const value = cursor.values[index] ?? null;
    switch (key.column) {
      case "id":
        fields.id = typeof value === "string" ? value : "";
        break;
      case "published_at":
        fields.published_at = typeof value === "string" ? value : null;
        break;
      case "discount_percent":
        fields.discount_percent = typeof value === "number" ? value : null;
        break;
      case "current_price":
        fields.current_price = typeof value === "number" ? value : 0;
        break;
    }
  });
  return fields;
}

/** Whether `row` sorts strictly after the cursor position (in render order). */
export function rowIsAfterCursor(row: OfferOrderFields, cursor: OffersCursor): boolean {
  return compareOffersForSort(row, cursorToOrderFields(cursor), cursor.sort) > 0;
}
