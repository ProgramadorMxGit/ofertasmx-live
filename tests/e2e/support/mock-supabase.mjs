// @ts-nocheck
/**
 * Deterministic mock Supabase server for the Playwright e2e suite
 * (Task 38.1 / R29.3, R29.4).
 *
 * The app reads through `@supabase/ssr` against `NEXT_PUBLIC_SUPABASE_URL`. By
 * pointing that URL at this process, BOTH the server-side SSR fetches and the
 * browser anon client hit a deterministic, in-memory dataset — so e2e never
 * touches the real bot, database or any credential. It implements only the slice
 * of PostgREST + GoTrue the app uses:
 *
 *   - `GET /rest/v1/offers`           — list / detail (array & single-object modes)
 *   - `GET /rest/v1/offer_categories` — category id-by-slug lookup
 *   - `GET /auth/v1/user`             — returns the allowlisted test admin
 *   - `POST /auth/v1/otp`             — magic-link request (no-op 200)
 *   - `POST /auth/v1/logout`          — sign-out (204)
 *   - `GET /health`                   — Playwright webServer readiness probe
 *
 * Realtime is intentionally NOT served: under `NEXT_PUBLIC_E2E=1` the client
 * bypasses the real channel and the suite injects events via a window event
 * (see `components/offers/use-offers-realtime.ts`).
 *
 * Run with plain `node` (no extra deps). Port comes from `MOCK_SUPABASE_PORT`.
 *
 * The seed mirrors `tests/fixtures/offers.ts`; it is inlined here so the server
 * stays a dependency-free standalone process.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54330);

/** The allowlisted admin the mock authenticates (must match ADMIN_EMAIL env). */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.test";

const CATEGORY_ELECTRONICA = "10000000-0000-4000-8000-0000000000a1";
const CATEGORY_HOGAR = "10000000-0000-4000-8000-0000000000a2";

/** Build a complete public offer row from overrides (fake, synthetic data). */
function offer(over) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    platform: "amazon",
    merchant: "Amazon México",
    external_product_id: "B0EXAMPLE01",
    title: "Audífonos inalámbricos de ejemplo con cancelación de ruido",
    slug: "audifonos-inalambricos-ejemplo-abc123",
    short_description: null,
    editorial_summary: null,
    image_url: "https://images.example.test/offers/audifonos.jpg",
    image_alt: "Audífonos inalámbricos de ejemplo en color negro",
    image_status: "ready",
    original_price: 1999.0,
    current_price: 1299.0,
    discount_percent: 35,
    currency: "MXN",
    affiliate_url: "https://www.amazon.com.mx/dp/B0EXAMPLE01?tag=programadormx-20",
    category_id: CATEGORY_ELECTRONICA,
    status: "active",
    is_featured: false,
    published_at: "2024-06-01T11:30:00.000Z",
    updated_at: "2024-06-01T11:45:00.000Z",
    last_verified_at: "2024-06-01T11:45:00.000Z",
    expires_at: null,
    created_at: "2024-06-01T11:30:00.000Z",
    ...over,
  };
}

const OFFERS = [
  offer({
    id: "00000000-0000-4000-8000-000000000001",
    title: "Audífonos inalámbricos de ejemplo con cancelación de ruido",
    slug: "audifonos-inalambricos-ejemplo-abc123",
    platform: "amazon",
    is_featured: true,
    discount_percent: 35,
    original_price: 1999.0,
    current_price: 1299.0,
    published_at: "2024-06-01T11:55:00.000Z",
    updated_at: "2024-06-01T11:55:00.000Z",
  }),
  offer({
    id: "00000000-0000-4000-8000-000000000002",
    title: "Licuadora de alto rendimiento de ejemplo para cocina",
    slug: "licuadora-alto-rendimiento-ejemplo-def456",
    platform: "mercado_libre",
    merchant: "Mercado Libre México",
    external_product_id: "MLM1234567",
    affiliate_url: "https://www.mercadolibre.com.mx/p/MLM1234567",
    category_id: CATEGORY_HOGAR,
    discount_percent: 20,
    original_price: 2499.0,
    current_price: 1999.0,
    published_at: "2024-06-01T11:40:00.000Z",
    updated_at: "2024-06-01T11:40:00.000Z",
  }),
  offer({
    id: "00000000-0000-4000-8000-000000000003",
    title: "Cargador USB-C de ejemplo sin precio de lista",
    slug: "cargador-usb-c-ejemplo-ghi789",
    platform: "amazon",
    external_product_id: "B0EXAMPLE03",
    affiliate_url: "https://www.amazon.com.mx/dp/B0EXAMPLE03?tag=programadormx-20",
    discount_percent: null,
    original_price: null,
    current_price: 349.0,
    published_at: "2024-06-01T11:20:00.000Z",
    updated_at: "2024-06-01T11:20:00.000Z",
  }),
];

const CATEGORIES = [
  { id: CATEGORY_ELECTRONICA, slug: "electronica", name: "Electrónica" },
  { id: CATEGORY_HOGAR, slug: "hogar", name: "Hogar" },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "content-range, content-profile",
};

/** Read an `eq.` filter value from the search params (e.g. `status=eq.active`). */
function eqValue(params, key) {
  const raw = params.get(key);
  if (raw === null) return undefined;
  return raw.startsWith("eq.") ? raw.slice(3) : raw;
}

/** Apply the subset of filters the app uses to the seeded offers. */
function filterOffers(params) {
  let rows = OFFERS.slice();
  const status = eqValue(params, "status");
  if (status) rows = rows.filter((o) => o.status === status);
  const platform = eqValue(params, "platform");
  if (platform) rows = rows.filter((o) => o.platform === platform);
  const slug = eqValue(params, "slug");
  if (slug) rows = rows.filter((o) => o.slug === slug);
  const id = eqValue(params, "id");
  if (id) rows = rows.filter((o) => o.id === id);
  const categoryId = eqValue(params, "category_id");
  if (categoryId) rows = rows.filter((o) => o.category_id === categoryId);
  if (params.get("is_featured") === "eq.true") {
    rows = rows.filter((o) => o.is_featured === true);
  }
  const minDiscount = params.get("discount_percent");
  if (minDiscount && minDiscount.startsWith("gte.")) {
    const n = Number(minDiscount.slice(4));
    rows = rows.filter((o) => o.discount_percent !== null && o.discount_percent >= n);
  }
  // Newest-first default; the precise keyset ordering is not needed for e2e.
  rows.sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
  const limit = Number(params.get("limit") ?? "100");
  return rows.slice(0, Number.isFinite(limit) ? limit : 100);
}

function send(res, status, body, extraHeaders = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

/** PostgREST single-object mode is signalled via the Accept header. */
function wantsSingleObject(req) {
  const accept = req.headers["accept"] ?? "";
  return accept.includes("vnd.pgrst.object+json");
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const { pathname, searchParams } = url;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (pathname === "/health") {
    send(res, 200, { ok: true });
    return;
  }

  if (pathname === "/rest/v1/offers" && req.method === "GET") {
    const rows = filterOffers(searchParams);
    if (wantsSingleObject(req)) {
      if (rows.length === 0) {
        // maybeSingle() maps PGRST116 to `data: null` without throwing.
        send(res, 406, { code: "PGRST116", message: "0 rows" });
        return;
      }
      send(res, 200, rows[0]);
      return;
    }
    send(res, 200, rows);
    return;
  }

  if (pathname === "/rest/v1/offer_categories" && req.method === "GET") {
    const slug = eqValue(searchParams, "slug");
    const rows = slug ? CATEGORIES.filter((c) => c.slug === slug) : CATEGORIES;
    if (wantsSingleObject(req)) {
      if (rows.length === 0) {
        send(res, 406, { code: "PGRST116", message: "0 rows" });
        return;
      }
      send(res, 200, rows[0]);
      return;
    }
    send(res, 200, rows);
    return;
  }

  // --- GoTrue (auth) ---------------------------------------------------------
  // The mock trusts any presented session and returns the allowlisted admin, so
  // the middleware + server guard admit a test admin (R10.4, R10.6).
  if (pathname === "/auth/v1/user" && req.method === "GET") {
    const auth = req.headers["authorization"] ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      send(res, 401, { code: 401, msg: "no session" });
      return;
    }
    send(res, 200, {
      id: "e2e-admin-id-0000-0000-000000000000",
      aud: "authenticated",
      role: "authenticated",
      email: ADMIN_EMAIL,
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: "2024-01-01T00:00:00.000Z",
    });
    return;
  }

  if (pathname === "/auth/v1/otp" && req.method === "POST") {
    send(res, 200, {});
    return;
  }

  if (pathname === "/auth/v1/logout" && req.method === "POST") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (pathname.startsWith("/auth/v1/")) {
    // Token refresh and any other auth call: hand back a benign session shape.
    send(res, 200, {
      access_token: "e2e-access-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "e2e-refresh-token",
      user: { id: "e2e-admin-id", email: ADMIN_EMAIL, aud: "authenticated", role: "authenticated" },
    });
    return;
  }

  send(res, 404, { error: "not_found", path: pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-supabase] listening on http://127.0.0.1:${PORT}`);
});
