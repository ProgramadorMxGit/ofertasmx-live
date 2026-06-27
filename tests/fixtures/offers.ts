import type { PublicOffer } from "@/lib/offers/query";

/**
 * Deterministic {@link PublicOffer} fixtures shared by the accessibility (axe)
 * unit tests and the Playwright e2e mock server.
 *
 * Everything here is **fake, clearly-synthetic data** — sentinel ids, example
 * domains and round prices — so no test ever depends on real credentials, the
 * real bot or the real database (R29.4). The values are stable so snapshots,
 * ordering assertions and "card appears" checks are reproducible.
 */

/** A fixed "now" anchor so relative-time and expiry logic stay deterministic. */
export const FIXTURE_NOW_ISO = "2024-06-01T12:00:00.000Z";

/** Build a complete {@link PublicOffer} from partial overrides. */
export function makePublicOffer(overrides: Partial<PublicOffer> = {}): PublicOffer {
  const base: PublicOffer = {
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
    category_id: "10000000-0000-4000-8000-0000000000a1",
    status: "active",
    is_featured: false,
    published_at: "2024-06-01T11:30:00.000Z",
    updated_at: "2024-06-01T11:45:00.000Z",
    last_verified_at: "2024-06-01T11:45:00.000Z",
    expires_at: null,
    created_at: "2024-06-01T11:30:00.000Z",
  };
  return { ...base, ...overrides };
}

/**
 * A small, deterministic seed list covering the variety the UI must handle
 * (R24.3): Amazon + Mercado Libre, featured, no original price, and one with a
 * future expiry. Ordered newest-first by `published_at`.
 */
export const SEED_OFFERS: readonly PublicOffer[] = [
  makePublicOffer({
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
  makePublicOffer({
    id: "00000000-0000-4000-8000-000000000002",
    title: "Licuadora de alto rendimiento de ejemplo para cocina",
    slug: "licuadora-alto-rendimiento-ejemplo-def456",
    platform: "mercado_libre",
    merchant: "Mercado Libre México",
    external_product_id: "MLM1234567",
    affiliate_url: "https://www.mercadolibre.com.mx/p/MLM1234567",
    category_id: "10000000-0000-4000-8000-0000000000a2",
    is_featured: false,
    discount_percent: 20,
    original_price: 2499.0,
    current_price: 1999.0,
    published_at: "2024-06-01T11:40:00.000Z",
    updated_at: "2024-06-01T11:40:00.000Z",
  }),
  makePublicOffer({
    id: "00000000-0000-4000-8000-000000000003",
    title: "Cargador USB-C de ejemplo sin precio de lista",
    slug: "cargador-usb-c-ejemplo-ghi789",
    platform: "amazon",
    external_product_id: "B0EXAMPLE03",
    affiliate_url: "https://www.amazon.com.mx/dp/B0EXAMPLE03?tag=programadormx-20",
    is_featured: false,
    discount_percent: null,
    original_price: null,
    current_price: 349.0,
    published_at: "2024-06-01T11:20:00.000Z",
    updated_at: "2024-06-01T11:20:00.000Z",
  }),
];

/**
 * A brand-new offer used to assert the realtime "new card appears" scenario
 * (R9.2): it sorts to the front for `recent` and is not in {@link SEED_OFFERS}.
 */
export const REALTIME_INSERT_OFFER: PublicOffer = makePublicOffer({
  id: "00000000-0000-4000-8000-0000000000ff",
  title: "Oferta nueva en vivo de ejemplo (insertada por Realtime)",
  slug: "oferta-nueva-en-vivo-ejemplo-zzz999",
  platform: "amazon",
  external_product_id: "B0EXAMPLEFF",
  affiliate_url: "https://www.amazon.com.mx/dp/B0EXAMPLEFF?tag=programadormx-20",
  is_featured: false,
  discount_percent: 50,
  original_price: 999.0,
  current_price: 499.0,
  published_at: "2024-06-01T12:05:00.000Z",
  updated_at: "2024-06-01T12:05:00.000Z",
});
