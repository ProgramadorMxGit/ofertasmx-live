import { describe, expect, it } from "vitest";

import {
  createLinkPort,
  DEFAULT_AMAZON_TRACKING_ID,
  extractAsin,
  extractMlm,
  verifyAmazonTag,
} from "@/lib/ssrf/identify";

/**
 * Example unit tests for identifier extraction, tag verification and the
 * SSRF-backed LinkPort (R5.5–R5.9).
 *
 * Broad-input coverage of round-trip extraction (Property 7) and tag
 * preservation (Property 9) lives in `identify.property.test.ts`.
 */

describe("extractAsin — ASIN from path or query (R5.5)", () => {
  it("extracts from /dp/, /gp/product/ and /gp/aw/d/ paths", () => {
    expect(extractAsin("https://www.amazon.com.mx/dp/B08Z6Z4P7C")).toBe("B08Z6Z4P7C");
    expect(extractAsin("https://www.amazon.com.mx/gp/product/B01ABCDEFG")).toBe("B01ABCDEFG");
    expect(extractAsin("https://www.amazon.com.mx/gp/aw/d/B0KEYBOARD")).toBe("B0KEYBOARD");
  });

  it("extracts from a /dp/ path followed by /ref or query", () => {
    expect(extractAsin("https://www.amazon.com.mx/dp/B08Z6Z4P7C/ref=sr_1_1")).toBe(
      "B08Z6Z4P7C",
    );
    expect(extractAsin("https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20")).toBe(
      "B08Z6Z4P7C",
    );
  });

  it("extracts from an `asin` query parameter and upper-cases it", () => {
    expect(extractAsin("https://www.amazon.com.mx/x?asin=b08z6z4p7c")).toBe("B08Z6Z4P7C");
  });

  it("returns null when no ASIN is present", () => {
    expect(extractAsin("https://www.amazon.com.mx/")).toBeNull();
    expect(extractAsin("https://amzn.to/abc123")).toBeNull();
    expect(extractAsin("not a url")).toBeNull();
  });
});

describe("extractMlm — Mercado Libre id (R5.9)", () => {
  it("normalizes MLM-123 and MLM123 to MLM123", () => {
    expect(extractMlm("https://articulo.mercadolibre.com.mx/MLM-123456789-licuadora")).toBe(
      "MLM123456789",
    );
    expect(extractMlm("https://www.mercadolibre.com.mx/p/MLM123456789")).toBe("MLM123456789");
  });

  it("returns null when no MLM id is present", () => {
    expect(extractMlm("https://www.mercadolibre.com.mx/ofertas")).toBeNull();
    expect(extractMlm("https://meli.la/xyz")).toBeNull();
  });
});

describe("verifyAmazonTag — preserve and verify (R5.6, R5.7, R5.8)", () => {
  it("matches the default tracking id without review", () => {
    const v = verifyAmazonTag(
      "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20",
    );
    expect(v).toEqual({ tag: "programadormx-20", needsReview: false });
    expect(DEFAULT_AMAZON_TRACKING_ID).toBe("programadormx-20");
  });

  it("flags review when the tag differs, keeping the tag verbatim", () => {
    const v = verifyAmazonTag("https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=otrotag-20");
    expect(v).toEqual({ tag: "otrotag-20", needsReview: true });
  });

  it("does not flag review when there is no tag", () => {
    expect(verifyAmazonTag("https://www.amazon.com.mx/dp/B08Z6Z4P7C")).toEqual({
      tag: null,
      needsReview: false,
    });
  });

  it("compares against a configured tracking id", () => {
    expect(verifyAmazonTag("https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=mitag-21", "mitag-21"))
      .toEqual({ tag: "mitag-21", needsReview: false });
  });
});

describe("createLinkPort — SSRF-backed LinkPort the parser injects (R5.5–R5.9)", () => {
  const link = createLinkPort();

  it("detects an Amazon long URL with ASIN and tag, preserving the URL", () => {
    const url = "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20";
    const info = link.detect(url);
    expect(info).not.toBeNull();
    expect(info?.platform).toBe("amazon");
    expect(info?.merchant).toBe("Amazon México");
    expect(info?.externalProductId).toBe("B08Z6Z4P7C");
    expect(info?.affiliateTag).toBe("programadormx-20");
    expect(info?.needsReview).toBe(false);
    expect(info?.url).toBe(url);
  });

  it("flags needsReview on a tag mismatch without altering the link", () => {
    const url = "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=otrotag-20";
    const info = link.detect(url);
    expect(info?.needsReview).toBe(true);
    expect(info?.affiliateTag).toBe("otrotag-20");
    expect(info?.url).toBe(url);
  });

  it("detects a Mercado Libre long URL with MLM, preserving attribution params", () => {
    const url =
      "https://articulo.mercadolibre.com.mx/MLM-123456789-licuadora?matt_tool=abc&forceInApp=true";
    const info = link.detect(url);
    expect(info?.platform).toBe("mercado_libre");
    expect(info?.merchant).toBe("Mercado Libre");
    expect(info?.externalProductId).toBe("MLM123456789");
    expect(info?.affiliateTag).toBeNull();
    expect(info?.url).toBe(url);
  });

  it("detects a short link by host but leaves the id null (expanded out-of-band)", () => {
    const amzn = link.detect("https://amzn.to/abc123");
    expect(amzn?.platform).toBe("amazon");
    expect(amzn?.externalProductId).toBeNull();
    const meli = link.detect("https://meli.la/xyz");
    expect(meli?.platform).toBe("mercado_libre");
    expect(meli?.externalProductId).toBeNull();
  });

  it("returns null for disallowed, non-HTTPS or credentialed URLs (SSRF)", () => {
    expect(link.detect("http://www.amazon.com.mx/dp/B08Z6Z4P7C")).toBeNull();
    expect(link.detect("https://evil.example/dp/B08Z6Z4P7C")).toBeNull();
    expect(link.detect("https://user:pass@www.amazon.com.mx/dp/B08Z6Z4P7C")).toBeNull();
    expect(link.detect("https://127.0.0.1/dp/B08Z6Z4P7C")).toBeNull();
  });

  it("honors a configured tracking id", () => {
    const customLink = createLinkPort({ trackingId: "mitag-21" });
    const info = customLink.detect("https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=mitag-21");
    expect(info?.needsReview).toBe(false);
  });
});
