import { describe, expect, it } from "vitest";

import {
  resolveShortLink,
  type DnsAddress,
  type DnsLookupFn,
  type FetchLikeFn,
  type MinimalHeaders,
} from "@/lib/ssrf/resolve";

/**
 * Example unit tests for the safe short-link resolver (R5.4).
 *
 * All network and DNS access is injected, so no real requests are made. Covers:
 * happy-path expansion within the hop limit, the redirect cap, the response
 * size guard, a missing `location`, HTTP errors, timeout/network failures, a
 * redirect that leaves the allowlist, and the DNS-rebinding guard (an allowed
 * host whose DNS points at a private address). The adversarial DNS-rebinding
 * behaviour is also covered broadly in `ssrf.property.test.ts` (Property 8).
 */

/** Builds a case-insensitive minimal Headers from a plain record. */
function headersOf(map: Record<string, string>): MinimalHeaders {
  const lower = new Map(
    Object.entries(map).map(([k, v]) => [k.toLowerCase(), v] as const),
  );
  return { get: (name) => lower.get(name.toLowerCase()) ?? null };
}

const publicDns: DnsLookupFn = async () =>
  [{ address: "13.32.1.1", family: 4 }] satisfies DnsAddress[];

const FINAL_AMAZON = "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20";

describe("resolveShortLink — happy path (R5.4)", () => {
  it("follows a single redirect from amzn.to to an allowed final URL", async () => {
    const fetchMock: FetchLikeFn = async (url) =>
      url.startsWith("https://amzn.to/")
        ? { status: 301, headers: headersOf({ location: FINAL_AMAZON }) }
        : { status: 200, headers: headersOf({}) };

    const result = await resolveShortLink("https://amzn.to/abc123", {
      fetch: fetchMock,
      lookup: publicDns,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalUrl).toBe(FINAL_AMAZON);
      expect(result.hops).toEqual(["https://amzn.to/abc123", FINAL_AMAZON]);
    }
  });
});

describe("resolveShortLink — limits and error handling (R5.4)", () => {
  it("rejects when redirects exceed the cap", async () => {
    let n = 0;
    const fetchMock: FetchLikeFn = async () => {
      n += 1;
      return {
        status: 302,
        headers: headersOf({ location: `https://www.amazon.com.mx/step-${n}` }),
      };
    };
    const result = await resolveShortLink("https://amzn.to/loop", {
      fetch: fetchMock,
      lookup: publicDns,
      maxRedirects: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_redirects");
    // 1 initial + 3 followed hops = 4 requests before the 4th redirect is refused.
    expect(n).toBe(4);
  });

  it("rejects an over-sized advertised response", async () => {
    const fetchMock: FetchLikeFn = async () => ({
      status: 200,
      headers: headersOf({ "content-length": String(5_000_000) }),
    });
    const result = await resolveShortLink("https://amzn.to/big", {
      fetch: fetchMock,
      lookup: publicDns,
      maxResponseBytes: 1_000_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("response_too_large");
  });

  it("rejects a redirect with no location header", async () => {
    const fetchMock: FetchLikeFn = async () => ({ status: 301, headers: headersOf({}) });
    const result = await resolveShortLink("https://amzn.to/x", {
      fetch: fetchMock,
      lookup: publicDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_location");
  });

  it("rejects a non-redirect, non-success status", async () => {
    const fetchMock: FetchLikeFn = async () => ({ status: 404, headers: headersOf({}) });
    const result = await resolveShortLink("https://amzn.to/missing", {
      fetch: fetchMock,
      lookup: publicDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("http_error");
  });

  it("reports a timeout when the request is aborted", async () => {
    const fetchMock: FetchLikeFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const result = await resolveShortLink("https://amzn.to/slow", {
      fetch: fetchMock,
      lookup: publicDns,
      timeoutMs: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("reports a network error when fetch rejects without an abort", async () => {
    const fetchMock: FetchLikeFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await resolveShortLink("https://amzn.to/down", {
      fetch: fetchMock,
      lookup: publicDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network_error");
  });
});

describe("resolveShortLink — allowlist + DNS rebinding on every hop (R5.4)", () => {
  it("rejects a redirect that leaves the allowlist", async () => {
    const fetchMock: FetchLikeFn = async (url) =>
      url.startsWith("https://amzn.to/")
        ? { status: 301, headers: headersOf({ location: "https://evil.example/x" }) }
        : { status: 200, headers: headersOf({}) };
    const result = await resolveShortLink("https://amzn.to/abc", {
      fetch: fetchMock,
      lookup: publicDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_allowlisted");
  });

  it("rejects when an allowed host resolves to a private IP (rebinding)", async () => {
    const fetchMock: FetchLikeFn = async () => ({ status: 200, headers: headersOf({}) });
    const privateDns: DnsLookupFn = async () => [{ address: "169.254.169.254", family: 4 }];
    const result = await resolveShortLink("https://amzn.to/abc", {
      fetch: fetchMock,
      lookup: privateDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dns_private_ip");
  });

  it("rejects the initial URL when it is not on the allowlist", async () => {
    const fetchMock: FetchLikeFn = async () => ({ status: 200, headers: headersOf({}) });
    const result = await resolveShortLink("https://evil.example/x", {
      fetch: fetchMock,
      lookup: publicDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_allowlisted");
  });

  it("reports a DNS failure distinctly", async () => {
    const fetchMock: FetchLikeFn = async () => ({ status: 200, headers: headersOf({}) });
    const failingDns: DnsLookupFn = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await resolveShortLink("https://amzn.to/abc", {
      fetch: fetchMock,
      lookup: failingDns,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dns_error");
  });
});
