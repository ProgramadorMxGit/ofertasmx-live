import { describe, expect, it } from "vitest";

import { analyzeTestMessage } from "@/lib/telegram/test-message";

/**
 * Unit tests for the "Probar mensaje" dry-run analysis (Task 35, R23.6).
 *
 * The analyzer is pure and shares the production parser/validator, so these
 * tests pin the behaviours the admin relies on: detected fields, the
 * decomposed review warnings (discount drift / tag mismatch), the derived
 * identity, and the webhook outcome (active / needs_review / rejected) —
 * including the no-allowed-merchant rejection. There is no DB involved: the
 * analysis never persists.
 */

const CONFIG = { trackingId: "programadormx-20" } as const;

const AMAZON_OK = [
  "Audífonos inalámbricos Sony",
  "Antes $1,999.00",
  "Ahora $1,499.00",
  "25% de descuento",
  "https://www.amazon.com.mx/dp/B0ABCDEFGH?tag=programadormx-20",
].join("\n");

describe("analyzeTestMessage — empty input", () => {
  it("returns the empty status when nothing is pasted", () => {
    expect(analyzeTestMessage({ text: "", caption: "" }, CONFIG)).toEqual({ status: "empty" });
    expect(analyzeTestMessage({ text: "   ", caption: "  " }, CONFIG)).toEqual({ status: "empty" });
  });
});

describe("analyzeTestMessage — valid Amazon offer with correct tag", () => {
  it("parses fields, derives identity and reports an active outcome with no warnings", () => {
    const result = analyzeTestMessage({ text: AMAZON_OK, caption: "" }, CONFIG);

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;

    expect(result.fields.title).toBe("Audífonos inalámbricos Sony");
    expect(result.fields.platform).toBe("amazon");
    expect(result.fields.merchant).toBe("Amazon México");
    expect(result.fields.currentPrice).toBe(1499);
    expect(result.fields.originalPrice).toBe(1999);
    expect(result.fields.discountPercent).toBe(25);
    expect(result.fields.externalProductId).toBe("B0ABCDEFGH");
    expect(result.fields.affiliateTag).toBe("programadormx-20");

    expect(result.derived.category).toBe("Electrónica");
    expect(result.derived.slug).toContain("audifonos");
    expect(result.derived.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    expect(result.needsReview).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.outcome).toEqual({
      wouldCreateOffer: true,
      resultingStatus: "active",
      rejectionReason: null,
    });
    expect(result.preview).not.toBeNull();
    expect(result.preview?.platform).toBe("amazon");
  });
});

describe("analyzeTestMessage — affiliate tag mismatch", () => {
  it("flags a tag_mismatch warning and a needs_review outcome", () => {
    const text = AMAZON_OK.replace("tag=programadormx-20", "tag=otrocanal-20");
    const result = analyzeTestMessage({ text, caption: "" }, CONFIG);

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;

    expect(result.needsReview).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain("tag_mismatch");
    expect(result.outcome.resultingStatus).toBe("needs_review");
    expect(result.outcome.wouldCreateOffer).toBe(true);
  });
});

describe("analyzeTestMessage — discount drift", () => {
  it("flags a discount_drift warning when written % differs from computed % by > 1pp", () => {
    const text = [
      "Taladro Bosch",
      "Antes $1,000.00",
      "Ahora $900.00",
      "¡50% de descuento!",
      "https://www.mercadolibre.com.mx/taladro/p/MLM123456789",
    ].join("\n");

    const result = analyzeTestMessage({ text, caption: "" }, CONFIG);

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;

    expect(result.fields.platform).toBe("mercado_libre");
    expect(result.fields.discountPercent).toBe(10);
    expect(result.needsReview).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["discount_drift"]);
    expect(result.outcome.resultingStatus).toBe("needs_review");
  });
});

describe("analyzeTestMessage — no allowed-merchant link", () => {
  it("detects fields but reports the webhook would reject it (no_allowed_merchant)", () => {
    const text = ["Licuadora Oster", "Antes $800.00", "Ahora $600.00", "25%"].join("\n");
    const result = analyzeTestMessage({ text, caption: "" }, CONFIG);

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") return;

    expect(result.fields.title).toBe("Licuadora Oster");
    expect(result.fields.currentPrice).toBe(600);
    expect(result.fields.platform).toBeNull();
    expect(result.derived.category).toBe("Hogar");
    expect(result.outcome).toEqual({
      wouldCreateOffer: false,
      resultingStatus: "rejected",
      rejectionReason: "no_allowed_merchant",
    });
    expect(result.preview).toBeNull();
  });
});

describe("analyzeTestMessage — price rejection", () => {
  it("returns a rejected status with the parser's reason when no price is present", () => {
    const text = [
      "Mira esta oferta increíble",
      "https://www.amazon.com.mx/dp/B0ABCDEFGH?tag=programadormx-20",
    ].join("\n");

    const result = analyzeTestMessage({ text, caption: "" }, CONFIG);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("missing_price");
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("analyzeTestMessage — purity", () => {
  it("is deterministic: the same input yields a deeply equal result", () => {
    const a = analyzeTestMessage({ text: AMAZON_OK, caption: "" }, CONFIG);
    const b = analyzeTestMessage({ text: AMAZON_OK, caption: "" }, CONFIG);
    expect(a).toEqual(b);
  });
});
