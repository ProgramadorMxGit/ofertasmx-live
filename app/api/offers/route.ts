import { NextResponse } from "next/server";

import { safeParseOffersQuery } from "@/lib/offers/query";
import { executeOffersQuery } from "@/lib/offers/server-fetch";

/**
 * `GET /api/offers` — public, filtered, keyset-paginated offer list
 * (R16.1, R16.2, R19.6, R10.3).
 *
 * Validation/normalization comes from the pure `lib/offers/query` module
 * (`safeParseOffersQuery`, unit-tested without a DB); the actual data access is
 * the shared `executeOffersQuery` in `lib/offers/server-fetch`, the single
 * execution path also used by the `/ofertas` SSR fetch — so filtering,
 * ordering, the keyset predicate and the opaque cursor are never duplicated.
 *
 * Reads run through the **anon** server client, so Row Level Security returns
 * only `status='active'` rows. Response:
 * `{ items: PublicOffer[], nextCursor: string | null }`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const parsed = safeParseOffersQuery(searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await executeOffersQuery(parsed.query);
  if (!result.ok) {
    return NextResponse.json(
      { error: "No se pudieron cargar las ofertas." },
      { status: 500 },
    );
  }

  return NextResponse.json(result.page);
}
