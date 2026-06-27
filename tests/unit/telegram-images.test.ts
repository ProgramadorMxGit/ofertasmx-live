import { describe, expect, it, vi } from "vitest";

import type { FetchFileResult, TelegramPhoto } from "@/lib/telegram/files";
import {
  FALLBACK_IMAGE_URL,
  OFFER_IMAGES_BUCKET,
  processOfferImage,
  validateImage,
  type ImageAnalysis,
  type ProcessImageDeps,
  type StorageUploadInput,
  type StorageUploadResult,
} from "@/lib/telegram/images";

/**
 * Fixture unit tests for the Image Processor's fallback + retry flow (R3.4,
 * R3.8) using injected mock fetch/analyzer/storage — no real bot, network or
 * `sharp`. They assert that a rejected image records a reason and yields the
 * fallback result, and that a valid image yields a *stable Storage URL* that is
 * never a Telegram/token URL (R3.6). The universal selection/validation
 * guarantees live in `telegram-images.property.test.ts` (Property 21).
 */

const PHOTOS: TelegramPhoto[] = [
  { file_id: "small", file_unique_id: "u1", width: 90, height: 90 },
  { file_id: "big", file_unique_id: "u2", width: 800, height: 600 },
];

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const SUPABASE_PUBLIC_URL =
  "https://proj.supabase.co/storage/v1/object/public/offer-images/fixed-uuid.jpg";

function okDownload(overrides: Partial<Extract<FetchFileResult, { ok: true }>> = {}): FetchFileResult {
  return {
    ok: true,
    bytes: BYTES,
    filePath: "photos/file_1.jpg",
    contentType: "image/jpeg",
    sizeBytes: BYTES.byteLength,
    ...overrides,
  };
}

const jpegAnalysis: ImageAnalysis = { format: "jpeg", width: 800, height: 600 };

/** Build deps with sensible valid defaults; override per test. */
function makeDeps(overrides: Partial<ProcessImageDeps> = {}): {
  deps: ProcessImageDeps;
  uploads: StorageUploadInput[];
} {
  const uploads: StorageUploadInput[] = [];
  const deps: ProcessImageDeps = {
    fetchFile: vi.fn(async () => okDownload()),
    analyze: vi.fn(async () => jpegAnalysis),
    upload: vi.fn(async (input: StorageUploadInput): Promise<StorageUploadResult> => {
      uploads.push(input);
      return { ok: true, publicUrl: SUPABASE_PUBLIC_URL };
    }),
    generateId: () => "fixed-uuid",
    ...overrides,
  };
  return { deps, uploads };
}

describe("processOfferImage — valid image", () => {
  it("stores the image and returns a stable Storage URL (never a Telegram/token URL)", async () => {
    const { deps, uploads } = makeDeps();

    const result = await processOfferImage(PHOTOS, deps);

    expect(result.imageStatus).toBe("ready");
    if (result.imageStatus !== "ready") return;

    // Stable, public Supabase Storage URL — not a Telegram/token URL (R3.6).
    expect(result.imageUrl).toBe(SUPABASE_PUBLIC_URL);
    expect(result.imageUrl).not.toContain("api.telegram.org");
    expect(result.imageUrl).not.toContain("/bot");
    expect(result.imageUrl).not.toMatch(/\d{6,}:[A-Za-z0-9_-]{20,}/); // bot-token shape
    expect(result.imageStoragePath).toBe("fixed-uuid.jpg");
    expect(result.contentType).toBe("image/jpeg");

    // The biggest photo was selected and its real bytes were uploaded.
    expect(deps.fetchFile).toHaveBeenCalledWith("big");
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      bucket: OFFER_IMAGES_BUCKET,
      path: "fixed-uuid.jpg",
      contentType: "image/jpeg",
    });
    expect(uploads[0].bytes).toBe(BYTES);
  });

  it("derives the extension from the analyzed format, not the declared MIME", async () => {
    // Declared MIME jpeg but the real decoded format is webp -> .webp + image/webp.
    const { deps, uploads } = makeDeps({
      analyze: vi.fn(async () => ({ format: "webp", width: 800, height: 600 })),
    });

    const result = await processOfferImage(PHOTOS, deps);

    expect(result.imageStatus).toBe("ready");
    if (result.imageStatus !== "ready") return;
    expect(result.imageStoragePath).toBe("fixed-uuid.webp");
    expect(result.contentType).toBe("image/webp");
    expect(uploads[0].contentType).toBe("image/webp");
  });
});

describe("processOfferImage — fallback flow", () => {
  it("falls back with 'no_photo' when there is no usable photo", async () => {
    const { deps } = makeDeps();
    const result = await processOfferImage([], deps);

    expect(result).toMatchObject({
      imageStatus: "failed",
      imageUrl: FALLBACK_IMAGE_URL,
      imageStoragePath: null,
      reason: "no_photo",
    });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("records the download reason and never uploads when the download fails", async () => {
    const { deps } = makeDeps({
      fetchFile: vi.fn(async (): Promise<FetchFileResult> => ({
        ok: false,
        reason: "download_failed",
      })),
    });

    const result = await processOfferImage(PHOTOS, deps);

    expect(result).toMatchObject({
      imageStatus: "failed",
      imageUrl: FALLBACK_IMAGE_URL,
      imageStoragePath: null,
      reason: "download_failed",
    });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("rejects a disallowed MIME with a recorded reason and the fallback image", async () => {
    const { deps } = makeDeps({
      fetchFile: vi.fn(async () => okDownload({ contentType: "application/pdf" })),
    });

    const result = await processOfferImage(PHOTOS, deps);

    expect(result).toMatchObject({
      imageStatus: "failed",
      imageUrl: FALLBACK_IMAGE_URL,
      reason: "mime_not_allowed",
    });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("rejects an oversized image as 'too_large'", async () => {
    const { deps } = makeDeps({
      fetchFile: vi.fn(async () => okDownload({ sizeBytes: 9_000_000 })),
    });

    const result = await processOfferImage(PHOTOS, deps);
    expect(result).toMatchObject({ imageStatus: "failed", reason: "too_large" });
  });

  it("rejects when the analyzed format is not an allowed image", async () => {
    const { deps } = makeDeps({
      analyze: vi.fn(async () => ({ format: "gif", width: 200, height: 200 })),
    });

    const result = await processOfferImage(PHOTOS, deps);
    expect(result).toMatchObject({ imageStatus: "failed", reason: "extension_not_allowed" });
  });

  it("falls back with 'analyze_failed' when the analyzer throws", async () => {
    const { deps } = makeDeps({
      analyze: vi.fn(async () => {
        throw new Error("corrupt");
      }),
    });

    const result = await processOfferImage(PHOTOS, deps);
    expect(result).toMatchObject({ imageStatus: "failed", reason: "analyze_failed" });
  });

  it("falls back with 'upload_failed' when the uploader reports an error", async () => {
    const { deps } = makeDeps({
      upload: vi.fn(async (): Promise<StorageUploadResult> => ({ ok: false, error: "boom" })),
    });

    const result = await processOfferImage(PHOTOS, deps);
    expect(result).toMatchObject({
      imageStatus: "failed",
      imageUrl: FALLBACK_IMAGE_URL,
      reason: "upload_failed",
    });
  });

  it("falls back with 'upload_failed' when the uploader throws", async () => {
    const { deps } = makeDeps({
      upload: vi.fn(async () => {
        throw new Error("network");
      }),
    });

    const result = await processOfferImage(PHOTOS, deps);
    expect(result).toMatchObject({ imageStatus: "failed", reason: "upload_failed" });
  });
});

describe("validateImage — examples", () => {
  const valid = { contentType: "image/jpeg", sizeBytes: 1024, format: "jpeg", width: 800, height: 600 };

  it("accepts a well-formed jpeg and reports its extension + canonical MIME", () => {
    expect(validateImage(valid)).toEqual({ ok: true, ext: "jpg", mime: "image/jpeg" });
  });

  it("treats dimensions as vacuously valid when unknown (R3.3 'when possible')", () => {
    expect(validateImage({ ...valid, width: null, height: null })).toMatchObject({ ok: true });
  });

  it("rejects empty, oversized, bad-MIME, bad-format and out-of-range dimensions", () => {
    expect(validateImage({ ...valid, sizeBytes: 0 })).toEqual({ ok: false, reason: "empty" });
    expect(validateImage({ ...valid, sizeBytes: 9_000_000 })).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(validateImage({ ...valid, contentType: "image/gif" })).toEqual({
      ok: false,
      reason: "mime_not_allowed",
    });
    expect(validateImage({ ...valid, format: "gif" })).toEqual({
      ok: false,
      reason: "extension_not_allowed",
    });
    expect(validateImage({ ...valid, width: 10, height: 10 })).toEqual({
      ok: false,
      reason: "dimensions_out_of_range",
    });
  });
});
