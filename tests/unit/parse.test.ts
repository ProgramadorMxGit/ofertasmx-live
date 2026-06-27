import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import {
  MAX_REASONABLE_PRICE,
  defaultLinkPort,
  evaluatePrices,
  parseOffer,
  reconcileDiscount,
} from "@/lib/parser/parse";

/**
 * Example unit tests for the Message Parser (R4.4–R4.13).
 *
 * Covers the canonical sample message end to end, price extraction tolerant to
 * case/spaces/thousands/cents/`$`/`MXN`, the exact decimal discount recompute
 * with ±1pp reconciliation, the rejection rules, offers without an original
 * price, and the "never invent a field" rule. Broad-input coverage lives in the
 * companion property tests (`parse.property.test.ts`).
 */

const SAMPLE_MESSAGE = [
  "Lugz Lear Tenis para Hombre",
  "🔥 60% de descuento",
  "Antes: $1,220.27",
  "AHORA: $487.22",
  "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20",
].join("\n");

describe("parseOffer — canonical sample message (end to end)", () => {
  const result = parseOffer({
    text: SAMPLE_MESSAGE,
    telegram_message_id: 42,
    telegram_update_id: 1001,
    date: 1_700_000_000,
  });

  it("accepts the offer", () => {
    expect(result.ok).toBe(true);
  });

  it("extracts the title as the text before the first promotional line", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.offer.title).toBe("Lugz Lear Tenis para Hombre");
  });

  it("extracts the labeled original and current prices exactly", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.offer.original_price?.toFixed(2)).toBe("1220.27");
    expect(result.offer.current_price.toFixed(2)).toBe("487.22");
  });

  it("recomputes the discount and silently corrects within ±1pp", () => {
    if (!result.ok) throw new Error("expected ok");
    // (1220.27 - 487.22) / 1220.27 * 100 = 60.07% -> 60, drift 0.07 <= 1.
    expect(result.offer.discount_percent).toBe(60);
    expect(result.offer.needs_review).toBe(false);
  });

  it("detects the Amazon link, platform, merchant, ASIN and tag", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.offer.platform).toBe("amazon");
    expect(result.offer.merchant).toBe("Amazon México");
    expect(result.offer.external_product_id).toBe("B08Z6Z4P7C");
    expect(result.offer.affiliate_tag).toBe("programadormx-20");
    expect(result.offer.affiliate_url).toBe(
      "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20",
    );
  });

  it("derives metadata fields and preserves the raw text", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.offer.telegram_message_id).toBe(42);
    expect(result.offer.telegram_update_id).toBe(1001);
    expect(result.offer.published_at).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(result.offer.raw_text).toBe(SAMPLE_MESSAGE);
  });
});

describe("parseOffer — tolerant price extraction (R4.2)", () => {
  it("tolerates mixed case labels, MXN marker, NBSP and extra blank lines", () => {
    const msg = [
      "Audífonos Inalámbricos",
      "",
      "",
      "precio normal 1\u00a0299.00 MXN",
      "AHORA solo $899 mxn",
      "https://www.amazon.com.mx/dp/B01ABCDEFG?tag=programadormx-20",
    ].join("\n");
    const r = parseOffer({ text: msg });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.original_price?.toFixed(2)).toBe("1299.00");
    expect(r.offer.current_price.toFixed(2)).toBe("899.00");
  });

  it("reads a caption when there is no text and a European decimal format", () => {
    const caption = [
      "Licuadora Oster",
      "Antes: $1.299,00",
      "Ahora: $999,00",
      "https://articulo.mercadolibre.com.mx/MLM-123456789-licuadora",
    ].join("\n");
    const r = parseOffer({ caption });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.original_price?.toFixed(2)).toBe("1299.00");
    expect(r.offer.current_price.toFixed(2)).toBe("999.00");
    expect(r.offer.platform).toBe("mercado_libre");
    expect(r.offer.external_product_id).toBe("MLM123456789");
  });

  it("infers original=max and current=min from two unlabeled prices", () => {
    const msg = [
      "Teclado Mecánico",
      "$1,500.00 $999.00",
      "https://www.amazon.com.mx/dp/B0KEYBOARD1?tag=programadormx-20",
    ].join("\n");
    const r = parseOffer({ text: msg });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.original_price?.toFixed(2)).toBe("1500.00");
    expect(r.offer.current_price.toFixed(2)).toBe("999.00");
  });
});

describe("parseOffer — offers without an original price (R4.12)", () => {
  it("accepts a single-price offer with discount_percent = null", () => {
    const msg = [
      "Cargador USB-C",
      "Precio: $199.00",
      "https://www.amazon.com.mx/dp/B0CHARGER12?tag=programadormx-20",
    ].join("\n");
    const r = parseOffer({ text: msg });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.original_price).toBeNull();
    expect(r.offer.discount_percent).toBeNull();
    expect(r.offer.current_price.toFixed(2)).toBe("199.00");
  });
});

describe("parseOffer — rejection rules (R4.10, R4.11)", () => {
  it("rejects when current >= original with an original present", () => {
    const msg = [
      "Producto raro",
      "Antes: $100.00",
      "Ahora: $150.00",
      "https://www.amazon.com.mx/dp/B0BADPRICE1?tag=programadormx-20",
    ].join("\n");
    const r = parseOffer({ text: msg });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("current_ge_original");
  });

  it("rejects when no price can be found", () => {
    const r = parseOffer({ text: "Solo un título sin precio\nhttps://example.com" });
    expect(r.ok).toBe(false);
  });
});

describe("parseOffer — never invents fields (R4.13)", () => {
  it("leaves link-derived fields null when there is no allowed URL", () => {
    const msg = ["Producto", "$199.00", "https://sitio-no-permitido.com/x"].join("\n");
    const r = parseOffer({ text: msg });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.affiliate_url).toBeNull();
    expect(r.offer.platform).toBeNull();
    expect(r.offer.merchant).toBeNull();
    expect(r.offer.external_product_id).toBeNull();
  });

  it("leaves metadata null when not provided", () => {
    const r = parseOffer({ text: "Producto\n$199.00" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offer.telegram_message_id).toBeNull();
    expect(r.offer.telegram_update_id).toBeNull();
    expect(r.offer.published_at).toBeNull();
  });
});

describe("evaluatePrices — price validity (R4.10, R4.11)", () => {
  it("accepts a valid original > current > 0", () => {
    expect(evaluatePrices(new Decimal(100), new Decimal(60))).toEqual({ ok: true });
  });

  it("rejects a missing current price", () => {
    expect(evaluatePrices(null, null)).toEqual({ ok: false, reason: "missing_price" });
  });

  it("rejects a negative price", () => {
    expect(evaluatePrices(null, new Decimal(-1))).toEqual({
      ok: false,
      reason: "negative_price",
    });
  });

  it("rejects an absurd price above the maximum", () => {
    expect(evaluatePrices(null, MAX_REASONABLE_PRICE.plus(1))).toEqual({
      ok: false,
      reason: "absurd_price",
    });
  });

  it("rejects a zero current price as absurd", () => {
    expect(evaluatePrices(null, new Decimal(0))).toEqual({
      ok: false,
      reason: "absurd_price",
    });
  });

  it("rejects current >= original", () => {
    expect(evaluatePrices(new Decimal(100), new Decimal(100))).toEqual({
      ok: false,
      reason: "current_ge_original",
    });
  });
});

describe("reconcileDiscount — exact recompute and ±1pp tolerance (R4.7–R4.9)", () => {
  it("returns null discount and no review when there is no original price", () => {
    expect(reconcileDiscount(null, new Decimal(100), 50)).toEqual({
      discountPercent: null,
      needsReview: false,
    });
  });

  it("uses the computed value when no written percent is given", () => {
    expect(reconcileDiscount(new Decimal(100), new Decimal(75), null)).toEqual({
      discountPercent: 25,
      needsReview: false,
    });
  });

  it("silently corrects to the computed value within ±1pp", () => {
    // computed = 25; written = 24 -> drift 1 <= 1 -> no review, stored 25.
    expect(reconcileDiscount(new Decimal(100), new Decimal(75), 24)).toEqual({
      discountPercent: 25,
      needsReview: false,
    });
  });

  it("flags needs_review when the drift exceeds 1pp", () => {
    // computed = 25; written = 40 -> drift 15 > 1 -> review, stored 25.
    expect(reconcileDiscount(new Decimal(100), new Decimal(75), 40)).toEqual({
      discountPercent: 25,
      needsReview: true,
    });
  });
});

describe("defaultLinkPort — minimal allowed-merchant detection (Task 5 seam)", () => {
  it("flags needs_review when the Amazon tag differs from the tracking id", () => {
    const info = defaultLinkPort.detect(
      "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=otrotag-20",
    );
    expect(info).not.toBeNull();
    expect(info?.needsReview).toBe(true);
    expect(info?.affiliateTag).toBe("otrotag-20");
  });

  it("rejects non-HTTPS and non-allowed hosts", () => {
    expect(defaultLinkPort.detect("http://www.amazon.com.mx/dp/B08Z6Z4P7C")).toBeNull();
    expect(defaultLinkPort.detect("https://malicioso.example/dp/B08Z6Z4P7C")).toBeNull();
  });
});
