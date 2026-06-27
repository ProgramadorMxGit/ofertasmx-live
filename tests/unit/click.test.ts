import { describe, expect, it } from "vitest";

import {
  isIpHost,
  parseClickParams,
  referrerDomainFromReferer,
  resolveClickRedirect,
  sanitizeClickSource,
} from "@/lib/offers/click";

/**
 * Unit tests for the click redirector helpers (Task 19.1).
 * Validates: Requirements 11.4, 11.5, 11.6, 6.11
 */

describe("resolveClickRedirect (examples)", () => {
  it("redirects to the stored url regardless of client url/dest", () => {
    const decision = resolveClickRedirect(
      { affiliate_url: "https://www.amazon.com.mx/dp/B08ABCDEFG?tag=programadormx-20" },
      { url: "https://evil.example/phish", dest: "https://evil.example/2" },
    );
    expect(decision).toEqual({
      redirect: true,
      target: "https://www.amazon.com.mx/dp/B08ABCDEFG?tag=programadormx-20",
    });
  });

  it("does not redirect for a missing offer", () => {
    expect(resolveClickRedirect(null)).toEqual({ redirect: false });
  });

  it("does not redirect when affiliate_url is null", () => {
    expect(resolveClickRedirect({ affiliate_url: null })).toEqual({ redirect: false });
  });
});

describe("parseClickParams", () => {
  it("extracts only url/dest from the query", () => {
    const params = new URLSearchParams("url=https://a.test&dest=https://b.test&src=card");
    expect(parseClickParams(params)).toEqual({
      url: "https://a.test",
      dest: "https://b.test",
    });
  });
});

describe("isIpHost", () => {
  it("flags IPv4 and IPv6 literals", () => {
    expect(isIpHost("192.168.1.10")).toBe(true);
    expect(isIpHost("8.8.8.8")).toBe(true);
    expect(isIpHost("[::1]")).toBe(true);
    expect(isIpHost("2001:db8::1")).toBe(true);
  });

  it("does not flag domains", () => {
    expect(isIpHost("amazon.com.mx")).toBe(false);
    expect(isIpHost("www.example.org")).toBe(false);
  });
});

describe("referrerDomainFromReferer", () => {
  it("returns the lowercased host only, never path or query", () => {
    expect(referrerDomainFromReferer("https://Programadormx.online/ofertas?x=1#h")).toBe(
      "programadormx.online",
    );
  });

  it("returns null for an IP referer (never store a full IP)", () => {
    expect(referrerDomainFromReferer("http://192.168.1.5/page")).toBeNull();
    expect(referrerDomainFromReferer("http://[::1]:3000/x")).toBeNull();
  });

  it("returns null for missing or invalid referers", () => {
    expect(referrerDomainFromReferer(null)).toBeNull();
    expect(referrerDomainFromReferer("")).toBeNull();
    expect(referrerDomainFromReferer("not a url")).toBeNull();
  });
});

describe("sanitizeClickSource", () => {
  it("accepts short opaque labels", () => {
    expect(sanitizeClickSource("card")).toBe("card");
    expect(sanitizeClickSource("Featured_1")).toBe("featured_1");
  });

  it("drops junk, overly long, or PII-ish values", () => {
    expect(sanitizeClickSource(null)).toBeNull();
    expect(sanitizeClickSource("")).toBeNull();
    expect(sanitizeClickSource("a@b.com")).toBeNull();
    expect(sanitizeClickSource("x".repeat(40))).toBeNull();
  });
});
