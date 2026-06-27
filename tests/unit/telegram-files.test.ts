import { describe, expect, it, vi } from "vitest";

import {
  fetchTelegramFile,
  selectBestPhoto,
  type FetchResponseLike,
  type TelegramFetchFn,
  type TelegramPhoto,
} from "@/lib/telegram/files";

/**
 * Unit tests for photo selection (R3.1) and the token-safe file download
 * (R3.2). The downloader uses an injected `fetch` so no real bot is contacted;
 * the key security assertion is that the Bot Token is used to build the request
 * URL but never appears in the returned result (R3.2, R1.16). The universal
 * selection invariant lives in `telegram-images.property.test.ts` (Property 21).
 */

function photo(overrides: Partial<TelegramPhoto>): TelegramPhoto {
  return { file_id: "f", file_unique_id: "u", width: 100, height: 100, ...overrides };
}

describe("selectBestPhoto", () => {
  it("returns null for an empty array", () => {
    expect(selectBestPhoto([])).toBeNull();
  });

  it("returns null when no photo has positive dimensions", () => {
    expect(
      selectBestPhoto([photo({ width: 0, height: 10 }), photo({ width: 10, height: 0 })]),
    ).toBeNull();
  });

  it("ignores entries with an empty file_id", () => {
    const good = photo({ file_id: "good", width: 200, height: 200 });
    expect(selectBestPhoto([photo({ file_id: "", width: 999, height: 999 }), good])).toBe(good);
  });

  it("picks the largest-area photo under the default cap", () => {
    const small = photo({ file_id: "s", width: 90, height: 90 });
    const medium = photo({ file_id: "m", width: 320, height: 320 });
    const large = photo({ file_id: "l", width: 1280, height: 960 });
    expect(selectBestPhoto([small, large, medium])).toBe(large);
  });

  it("excludes photos above the cap and picks the largest that fits", () => {
    const fits = photo({ file_id: "fits", width: 1000, height: 1000 }); // 1,000,000
    const over = photo({ file_id: "over", width: 2000, height: 2000 }); // 4,000,000
    expect(selectBestPhoto([over, fits], { maxArea: 1_000_000 })).toBe(fits);
  });

  it("falls back to the smallest photo when all exceed the cap", () => {
    const big = photo({ file_id: "big", width: 3000, height: 3000 });
    const bigger = photo({ file_id: "bigger", width: 4000, height: 4000 });
    expect(selectBestPhoto([bigger, big], { maxArea: 1_000_000 })).toBe(big);
  });

  it("is deterministic on equal areas (keeps the earliest)", () => {
    const a = photo({ file_id: "a", width: 200, height: 100 });
    const b = photo({ file_id: "b", width: 100, height: 200 });
    expect(selectBestPhoto([a, b])).toBe(a);
  });
});

// --- fetchTelegramFile ------------------------------------------------------

const TOKEN = "1234567:FAKE-tElEgRaM-bOt-token-DO-NOT-LOG";

interface FakeResponseInit {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: Uint8Array;
}

function fakeResponse(init: FakeResponseInit): FetchResponseLike {
  const headers = init.headers ?? {};
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => init.json,
    arrayBuffer: async () => {
      const bytes = init.body ?? new Uint8Array();
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    },
  };
}

/** A fetch that answers getFile then the download, recording requested URLs. */
function makeFetch(
  responder: (url: string) => FetchResponseLike,
): { fetch: TelegramFetchFn; urls: string[] } {
  const urls: string[] = [];
  const fetch: TelegramFetchFn = vi.fn(async (url) => {
    urls.push(url);
    return responder(url);
  });
  return { fetch, urls };
}

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function happyResponder(url: string): FetchResponseLike {
  if (url.includes("/getFile")) {
    return fakeResponse({ json: { ok: true, result: { file_path: "photos/file_1.jpg" } } });
  }
  return fakeResponse({
    headers: { "content-type": "image/jpeg", "content-length": String(IMAGE_BYTES.byteLength) },
    body: IMAGE_BYTES,
  });
}

describe("fetchTelegramFile", () => {
  it("downloads bytes via getFile and never leaks the token in the result", async () => {
    const { fetch, urls } = makeFetch(happyResponder);

    const result = await fetchTelegramFile({ fileId: "abc" }, { token: TOKEN, fetch });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.bytes)).toEqual(Array.from(IMAGE_BYTES));
    expect(result.filePath).toBe("photos/file_1.jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(IMAGE_BYTES.byteLength);

    // The token IS used to build the request URLs (server-side, in memory)...
    expect(urls[0]).toContain(`/bot${TOKEN}/getFile`);
    expect(urls[0]).toContain("file_id=abc");
    expect(urls[1]).toContain(`/file/bot${TOKEN}/photos/file_1.jpg`);

    // ...but it NEVER appears in the returned result (R3.2, R1.16, R3.6).
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(result.filePath).not.toContain(TOKEN);
  });

  it("rejects an empty file id without any request", async () => {
    const { fetch, urls } = makeFetch(happyResponder);
    const result = await fetchTelegramFile({ fileId: "" }, { token: TOKEN, fetch });
    expect(result).toEqual({ ok: false, reason: "invalid_file_id" });
    expect(urls).toHaveLength(0);
  });

  it("returns 'getfile_failed' when getFile responds not-ok", async () => {
    const { fetch } = makeFetch(() => fakeResponse({ ok: false, status: 404, json: {} }));
    const result = await fetchTelegramFile({ fileId: "abc" }, { token: TOKEN, fetch });
    expect(result).toEqual({ ok: false, reason: "getfile_failed" });
  });

  it("returns 'missing_file_path' when getFile omits file_path", async () => {
    const { fetch } = makeFetch(() => fakeResponse({ json: { ok: true, result: {} } }));
    const result = await fetchTelegramFile({ fileId: "abc" }, { token: TOKEN, fetch });
    expect(result).toEqual({ ok: false, reason: "missing_file_path" });
  });

  it("returns 'download_failed' when the file download responds not-ok", async () => {
    const { fetch } = makeFetch((url) =>
      url.includes("/getFile")
        ? fakeResponse({ json: { ok: true, result: { file_path: "photos/x.jpg" } } })
        : fakeResponse({ ok: false, status: 500 }),
    );
    const result = await fetchTelegramFile({ fileId: "abc" }, { token: TOKEN, fetch });
    expect(result).toEqual({ ok: false, reason: "download_failed" });
  });

  it("rejects 'too_large' from the advertised content-length", async () => {
    const { fetch } = makeFetch((url) =>
      url.includes("/getFile")
        ? fakeResponse({ json: { ok: true, result: { file_path: "photos/x.jpg" } } })
        : fakeResponse({ headers: { "content-length": "99999999" }, body: IMAGE_BYTES }),
    );
    const result = await fetchTelegramFile(
      { fileId: "abc" },
      { token: TOKEN, fetch, maxBytes: 1000 },
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects 'empty' when the download has zero bytes", async () => {
    const { fetch } = makeFetch((url) =>
      url.includes("/getFile")
        ? fakeResponse({ json: { ok: true, result: { file_path: "photos/x.jpg" } } })
        : fakeResponse({ headers: { "content-type": "image/png" }, body: new Uint8Array() }),
    );
    const result = await fetchTelegramFile({ fileId: "abc" }, { token: TOKEN, fetch });
    expect(result).toEqual({ ok: false, reason: "empty" });
  });

  it("maps a thrown fetch (no abort) to 'network_error'", async () => {
    const fetch: TelegramFetchFn = vi.fn(async () => {
      throw new Error("connreset");
    });
    const result = await fetchTelegramFile({ fileId: "abc" }, { token: TOKEN, fetch });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });
});
