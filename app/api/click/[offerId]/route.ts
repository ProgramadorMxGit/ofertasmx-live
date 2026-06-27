import {
  parseClickParams,
  referrerDomainFromReferer,
  resolveClickRedirect,
  sanitizeClickSource,
} from "@/lib/offers/click";
import { isUuid } from "@/lib/offers/query";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * `GET /api/click/[offerId]` — the closed click redirector (R11).
 *
 * Anti open-redirect by construction:
 *   1. Validate the offer exists; if not, 404 WITHOUT redirecting (R11.3, R11.6).
 *   2. Record minimal analytics — `source` (from `?src=`) and the `Referer`
 *      *domain* only, never a full IP (R11.4, R6.11).
 *   3. Redirect 302 ONLY to the offer's stored `affiliate_url`; any
 *      client-supplied destination is ignored (R11.5).
 *
 * Uses the service-role client so an offer is resolvable regardless of status
 * (RLS would hide non-active rows), and so the analytics insert is permitted
 * (anon cannot write `offer_clicks`). The redirect decision itself is the pure
 * `resolveClickRedirect`, which Property 17 verifies in isolation.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ offerId: string }> },
): Promise<Response> {
  const { offerId } = await context.params;
  if (!isUuid(offerId)) {
    // Malformed id can never match a real offer → no redirect (R11.6).
    return new Response("Oferta no encontrada", { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const { data: offer, error } = await supabase
    .from("offers")
    .select("id, affiliate_url")
    .eq("id", offerId)
    .maybeSingle<{ id: string; affiliate_url: string | null }>();

  if (error) {
    // A lookup failure is not a "missing offer": do not redirect, do not 404.
    return new Response("No se pudo procesar el clic", { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const decision = resolveClickRedirect(offer, parseClickParams(params));
  if (!decision.redirect) {
    return new Response("Oferta no encontrada", { status: 404 }); // R11.3, R11.6
  }

  // Minimal, privacy-preserving analytics (R11.4, R6.11). Best-effort: never
  // block the redirect on a logging failure.
  if (offer) {
    const source = sanitizeClickSource(params.get("src"));
    const referrerDomain = referrerDomainFromReferer(request.headers.get("referer"));
    try {
      await supabase
        .from("offer_clicks")
        .insert({ offer_id: offer.id, source, referrer_domain: referrerDomain });
    } catch {
      // Analytics is non-critical; swallow and proceed to the redirect.
    }
  }

  // 302 to the STORED affiliate URL only (R11.5). A manual Location header
  // avoids `Response.redirect`'s URL parsing, which could throw.
  return new Response(null, {
    status: 302,
    headers: { Location: decision.target },
  });
}
