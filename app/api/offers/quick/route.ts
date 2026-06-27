import "server-only";

import Decimal from "decimal.js";
import { z } from "zod";

import { computeFingerprint } from "@/lib/dedup/fingerprint";
import { generateSlug } from "@/lib/dedup/slug";
import { serverEnv } from "@/lib/env.server";
import { publicEnv } from "@/lib/env";
import { createLinkPort } from "@/lib/ssrf/identify";
import { validateUrl } from "@/lib/ssrf/validate";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { safeEqualSecret } from "@/lib/telegram/secret";

/**
 * `POST /api/offers/quick` — REST endpoint to publish an offer directly
 * without using Telegram.
 *
 * Authentication: `X-Quick-Offer-Key: <QUICK_OFFER_API_KEY>` header.
 * Constant-time comparison prevents timing-based key extraction.
 *
 * Accepted body:
 *   - title           (required) — offer product name
 *   - current_price   (required) — final price in MXN
 *   - original_price  (optional) — price before discount
 *   - discount_percent(optional) — calculated automatically if both prices given
 *   - affiliate_url   (required) — Amazon MX or Mercado Libre link
 *   - image_url       (optional) — if omitted, extracted automatically from
 *                                   the product page og:image meta tag
 *   - platform        (optional) — "amazon" | "mercado_libre" (auto-detected)
 *
 * The URL is validated against the SSRF allowlist. Platform is auto-detected
 * from the host. Fingerprint and slug are generated. The offer is inserted as
 * `status=active` and appears in real-time on the web via Supabase Realtime.
 *
 * Returns: `{ ok: true, id, slug, url }` on 201.
 *
 * Usage example (curl):
 *   curl -X POST https://ofertasmx-live.vercel.app/api/offers/quick \
 *     -H "Content-Type: application/json" \
 *     -H "X-Quick-Offer-Key: <key>" \
 *     -d '{"title":"Teclado Dareu Ek106pro","current_price":1297.98,"original_price":2700.47,"affiliate_url":"https://meli.la/1BSyRy0"}'
 */

export const runtime = "nodejs";

/** Maximum accepted request body size (1 MB). */
const MAX_BODY_BYTES = 1_000_000;

const bodySchema = z.object({
  title: z.string().min(1).max(500).trim(),
  current_price: z.number().positive(),
  original_price: z.number().positive().optional(),
  discount_percent: z.number().int().min(0).max(100).optional(),
  affiliate_url: z.string().url().min(1),
  image_url: z.string().url().optional(),
  platform: z.enum(["amazon", "mercado_libre"]).optional(),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Maps an allowed host to its platform. */
function detectPlatform(host: string): "amazon" | "mercado_libre" | null {
  const h = host.toLowerCase();
  if (h === "amzn.to" || h === "amazon.com.mx" || h.endsWith(".amazon.com.mx")) {
    return "amazon";
  }
  if (
    h === "meli.la" ||
    h === "mercadolibre.com.mx" ||
    h.endsWith(".mercadolibre.com.mx")
  ) {
    return "mercado_libre";
  }
  return null;
}

/**
 * Attempts to extract the main product image from a URL by fetching the page
 * and reading the `og:image` meta tag. Returns `null` on any failure so the
 * caller can degrade gracefully (offer saved without image).
 *
 * Limits: 5 s timeout, 500 KB body read, redirects followed automatically.
 * Works with both Amazon MX and Mercado Libre full product URLs, and with
 * short links (meli.la, amzn.to) since `fetch` follows redirects.
 */
async function fetchOgImage(productUrl: string): Promise<string | null> {
  try {
    const response = await fetch(productUrl, {
      redirect: "follow",
      headers: {
        // Realistic UA so Amazon/ML return full HTML instead of a bot block
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(5000), // 5 s max
    });

    if (!response.ok) return null;

    // Read at most 500 KB — og:image is always in the <head>
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = "";
    let bytesRead = 0;
    const MAX_BYTES = 500_000;

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      bytesRead += value?.length ?? 0;
      // Stop once we've passed </head> — og:image will be there
      if (html.includes("</head>") || html.includes("<body")) break;
    }
    reader.cancel().catch(() => undefined);

    // Match og:image in both attribute orders
    const match =
      /property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
      /content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);

    const imageUrl = match?.[1]?.trim();
    if (!imageUrl) return null;

    // Validate the extracted URL is a safe HTTPS URL
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol !== "https:") return null;
    } catch {
      return null;
    }

    return imageUrl;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  // ── 1. Authentication ────────────────────────────────────────────────────
  const expectedKey = serverEnv.QUICK_OFFER_API_KEY;
  if (!expectedKey) {
    // Endpoint disabled: QUICK_OFFER_API_KEY not configured.
    return json({ ok: false, error: "endpoint not configured" }, 503);
  }
  const providedKey = request.headers.get("x-quick-offer-key") ?? "";
  if (!safeEqualSecret(providedKey, expectedKey)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // ── 2. Body size check ───────────────────────────────────────────────────
  const advertised = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(advertised) && advertised > MAX_BODY_BYTES) {
    return json({ ok: false, error: "request body too large" }, 413);
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, error: "unreadable body" }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return json({ ok: false, error: "request body too large" }, 413);
  }

  // ── 3. JSON + Zod validation ─────────────────────────────────────────────
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = JSON.parse(rawBody) as unknown;
    const result = bodySchema.safeParse(raw);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "invalid body";
      return json({ ok: false, error: msg }, 400);
    }
    parsed = result.data;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  // ── 4. SSRF / allowlist validation ───────────────────────────────────────
  const urlCheck = validateUrl(parsed.affiliate_url);
  if (!urlCheck.ok) {
    return json({ ok: false, error: `URL rejected: ${urlCheck.reason}` }, 400);
  }

  // ── 5. Detect platform ───────────────────────────────────────────────────
  const platform = parsed.platform ?? detectPlatform(urlCheck.host);
  if (!platform) {
    return json(
      {
        ok: false,
        error:
          'Cannot detect platform from URL. Provide "platform": "amazon" | "mercado_libre".',
      },
      400,
    );
  }

  // ── 6. Extract product ID and affiliate tag ──────────────────────────────
  const linkPort = createLinkPort({ trackingId: serverEnv.AMAZON_TRACKING_ID });
  const linkInfo = linkPort.detect(parsed.affiliate_url);
  const externalProductId = linkInfo?.externalProductId ?? null;
  const affiliateTag = linkInfo?.affiliateTag ?? null;
  const needsReview = linkInfo?.needsReview ?? false;

  // ── 7. Calculate discount ────────────────────────────────────────────────
  let discountPercent: number | null = parsed.discount_percent ?? null;
  if (
    discountPercent === null &&
    parsed.original_price != null &&
    parsed.original_price > parsed.current_price
  ) {
    const orig = new Decimal(parsed.original_price);
    const curr = new Decimal(parsed.current_price);
    discountPercent = orig.minus(curr).div(orig).mul(100).toDecimalPlaces(0).toNumber();
  }

  // ── 8. Fingerprint + slug ────────────────────────────────────────────────
  const fingerprint = computeFingerprint({
    platform,
    externalProductId,
    title: parsed.title,
    destinationUrl: parsed.affiliate_url,
  });
  const slug = generateSlug(parsed.title, { platform, externalProductId, fingerprint });

  // ── 8.5 Auto-fetch og:image when no image_url was provided ───────────────
  const imageUrl =
    parsed.image_url ??
    (await fetchOgImage(parsed.affiliate_url));

  // ── 9. Insert into Supabase ──────────────────────────────────────────────
  const client = createServiceRoleClient();
  const pseudoId = BigInt(Date.now()); // unique pseudo-id (not from Telegram)

  const { data: row, error } = await client
    .from("offers")
    .insert({
      platform,
      merchant: platform === "amazon" ? "Amazon México" : "Mercado Libre",
      external_product_id: externalProductId,
      fingerprint,
      telegram_chat_id: 0, // not from Telegram — use 0 as sentinel
      telegram_message_id: Number(pseudoId),
      telegram_update_id: Number(pseudoId),
      title: parsed.title,
      slug,
      image_url: imageUrl ?? null,
      image_status: imageUrl ? "ready" : "failed",
      image_retry_count: 0,
      original_price: parsed.original_price ?? null,
      current_price: parsed.current_price,
      discount_percent: discountPercent,
      currency: "MXN",
      affiliate_url: parsed.affiliate_url,
      affiliate_tag: affiliateTag,
      status: "active",
      needs_review: needsReview,
      raw_text: JSON.stringify({ source: "quick-api", ...parsed }),
      published_at: new Date().toISOString(),
    })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique constraint: same fingerprint / same product already exists.
      return json({ ok: false, error: "offer already exists (duplicate)" }, 409);
    }
    return json({ ok: false, error: error.message }, 500);
  }

  const offerUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/ofertas/${row.slug}`;
  return json(
    {
      ok: true,
      id: row.id,
      slug: row.slug,
      url: offerUrl,
      image_url: imageUrl ?? null,
      image_auto_fetched: imageUrl !== null && parsed.image_url == null,
    },
    201,
  );
}
