import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALLOWLIST,
  isAllowlistedHost,
  validateUrl,
} from "@/lib/ssrf/validate";

/**
 * Example unit tests for the SSRF URL validator (R5.1, R5.2, R5.3).
 *
 * Covers the allowlist (exact host + label-safe subdomains), and each rejection
 * path: non-HTTPS, embedded credentials, localhost, private/reserved/loopback/
 * link-local IP literals (including obfuscated decimal/hex IPv4 and IPv6),
 * cloud-metadata endpoints and disallowed/near-miss hosts. Broad-input coverage
 * lives in the companion property test (`ssrf.property.test.ts`, Property 8).
 */

describe("validateUrl — accepts allowed HTTPS merchant URLs (R5.1)", () => {
  for (const host of DEFAULT_ALLOWLIST) {
    it(`accepts https://${host}`, () => {
      const r = validateUrl(`https://${host}/dp/B08Z6Z4P7C?tag=programadormx-20`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.host).toBe(host);
    });
  }

  it("accepts a label-boundary subdomain of an allowed domain", () => {
    const r = validateUrl("https://articulo.mercadolibre.com.mx/MLM-123-x");
    expect(r.ok).toBe(true);
  });
});

describe("validateUrl — SSRF rejections without any request (R5.2, R5.3)", () => {
  it("rejects non-HTTPS schemes", () => {
    expect(validateUrl("http://www.amazon.com.mx/dp/B08Z6Z4P7C")).toEqual({
      ok: false,
      reason: "not_https",
    });
    expect(validateUrl("ftp://www.amazon.com.mx/x").ok).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(validateUrl("https://user:pass@www.amazon.com.mx/dp/B08Z6Z4P7C")).toEqual({
      ok: false,
      reason: "embedded_credentials",
    });
  });

  it("rejects localhost and *.localhost", () => {
    expect(validateUrl("https://localhost/x")).toEqual({ ok: false, reason: "localhost" });
    expect(validateUrl("https://api.localhost/x")).toEqual({
      ok: false,
      reason: "localhost",
    });
  });

  it("rejects private/loopback/link-local IPv4 literals", () => {
    expect(validateUrl("https://10.0.0.1/x")).toEqual({ ok: false, reason: "private_ip" });
    expect(validateUrl("https://192.168.1.1/x")).toEqual({
      ok: false,
      reason: "private_ip",
    });
    expect(validateUrl("https://172.16.5.4/x")).toEqual({ ok: false, reason: "private_ip" });
    expect(validateUrl("https://127.0.0.1/x")).toEqual({ ok: false, reason: "loopback_ip" });
    expect(validateUrl("https://169.254.10.10/x")).toEqual({
      ok: false,
      reason: "link_local_ip",
    });
  });

  it("rejects obfuscated decimal/hex IPv4 that the URL parser canonicalizes", () => {
    // 2130706433 and 0x7f000001 both normalize to 127.0.0.1.
    expect(validateUrl("https://2130706433/x")).toEqual({ ok: false, reason: "loopback_ip" });
    expect(validateUrl("https://0x7f000001/x")).toEqual({
      ok: false,
      reason: "loopback_ip",
    });
  });

  it("rejects IPv6 loopback and unique-local literals", () => {
    expect(validateUrl("https://[::1]/x")).toEqual({ ok: false, reason: "loopback_ip" });
    expect(validateUrl("https://[fc00::1]/x")).toEqual({ ok: false, reason: "private_ip" });
    expect(validateUrl("https://[fe80::1]/x")).toEqual({
      ok: false,
      reason: "link_local_ip",
    });
  });

  it("rejects cloud-metadata endpoints", () => {
    expect(validateUrl("https://169.254.169.254/latest/meta-data/")).toEqual({
      ok: false,
      reason: "cloud_metadata",
    });
    expect(validateUrl("https://metadata.google.internal/computeMetadata/v1/")).toEqual({
      ok: false,
      reason: "cloud_metadata",
    });
  });

  it("rejects disallowed and suffix-spoofing near-miss hosts", () => {
    expect(validateUrl("https://evil.example/dp/B08Z6Z4P7C")).toEqual({
      ok: false,
      reason: "not_allowlisted",
    });
    expect(validateUrl("https://notamazon.com.mx/x")).toEqual({
      ok: false,
      reason: "not_allowlisted",
    });
    expect(validateUrl("https://amazon.com.mx.evil.test/x")).toEqual({
      ok: false,
      reason: "not_allowlisted",
    });
  });

  it("rejects an unparseable URL", () => {
    expect(validateUrl("not a url")).toEqual({ ok: false, reason: "invalid_url" });
  });
});

describe("validateUrl — configurable allowlist (R5.1)", () => {
  it("honors a custom allowlist and rejects the defaults", () => {
    const config = { allowlist: ["example.com"] as const };
    expect(validateUrl("https://example.com/x", config).ok).toBe(true);
    expect(validateUrl("https://shop.example.com/x", config).ok).toBe(true);
    expect(validateUrl("https://www.amazon.com.mx/x", config)).toEqual({
      ok: false,
      reason: "not_allowlisted",
    });
  });
});

describe("isAllowlistedHost — label-boundary matching", () => {
  it("matches exact host and subdomains but not suffix spoofs", () => {
    expect(isAllowlistedHost("amazon.com.mx", DEFAULT_ALLOWLIST)).toBe(true);
    expect(isAllowlistedHost("articulo.mercadolibre.com.mx", DEFAULT_ALLOWLIST)).toBe(true);
    expect(isAllowlistedHost("notamazon.com.mx", DEFAULT_ALLOWLIST)).toBe(false);
    expect(isAllowlistedHost("amazon.com.mx.evil.test", DEFAULT_ALLOWLIST)).toBe(false);
  });
});
