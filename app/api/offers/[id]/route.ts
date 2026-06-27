import { NextResponse } from "next/server";

import {
  PUBLIC_OFFER_COLUMNS,
  isUuid,
  type PublicOffer,
} from "@/lib/offers/query";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * `GET /api/offers/[id]` — fetch a single active offer by id (R10.3, R16.x).
 *
 * Reads through the **anon** server client (RLS → only `status='active'` rows);
 * the explicit `status='active'` filter makes "404 when not active" hold
 * regardless of RLS. A malformed id short-circuits to 404 without a query.
 *
 * Response: `{ offer: PublicOffer }` on success; `{ error }` with 404 when the
 * offer is absent or not active.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Oferta no encontrada." }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("offers")
    .select(PUBLIC_OFFER_COLUMNS)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle<PublicOffer>();

  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar la oferta." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Oferta no encontrada." }, { status: 404 });
  }

  return NextResponse.json({ offer: data });
}
