/**
 * Image validation, storage and fallback (R3.3–R3.8).
 *
 * Orchestrates the server-side Image Processor on top of {@link selectBestPhoto}
 * and {@link fetchTelegramFile}, with every effectful dependency **injected** so
 * the whole pipeline is testable with fixtures and no real bot/network/`sharp`:
 *
 *  1. select the best photo (R3.1) and download its bytes (R3.2) — injected
 *     `fetchFile`;
 *  2. analyze the bytes with an injected {@link ImageAnalyzer} (a `sharp`-like
 *     metadata reader) — tests pass a stub so they need no real image;
 *  3. {@link validateImage}: accept iff MIME + size + extension + dimensions all
 *     pass; otherwise reject with a recorded reason (R3.3, R3.4);
 *  4. generate a safe `<uuid>.<ext>` filename and upload to the `offer-images`
 *     bucket through an injected {@link StorageUploader} (R3.5);
 *  5. return the **stable Supabase Storage public URL** + storage path (R3.6).
 *
 * On any failure (no photo, download, analysis, validation or upload) the
 * processor degrades to a {@link ProcessImageFallback}: `image_status='failed'`,
 * a fallback image URL and a machine-readable `reason`, so the Offer is still
 * saved and the Cron/Admin can retry later (R3.8). The returned `imageUrl` is
 * therefore **always** a stable Storage URL or the local fallback — never a
 * temporary, token-bearing Telegram URL (R3.6).
 *
 * Optimized variants (R3.7) are produced by the production adapter with `sharp`
 * and rendered with `next/image`; this module fixes the validated source URL
 * and storage path the render path consumes.
 */

import {
  selectBestPhoto,
  type FetchFileRejectionReason,
  type FetchFileResult,
  type TelegramPhoto,
} from "@/lib/telegram/files";

/** Supabase Storage bucket for offer images (public read, server write). */
export const OFFER_IMAGES_BUCKET = "offer-images";

/** Local fallback rendered when no valid image could be stored (R3.8). */
export const FALLBACK_IMAGE_URL = "/fallback-offer.svg";

/** Allowed declared MIME types (R3.3). */
export const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Maximum stored image size in bytes (R3.3). */
export const DEFAULT_MAX_IMAGE_BYTES = 5_000_000;

/** Minimum/maximum accepted dimension in px, when dimensions are known (R3.3). */
export const DEFAULT_MIN_DIMENSION = 50;
export const DEFAULT_MAX_DIMENSION = 6000;

/** Safe, allowed file extensions derived from the real (analyzed) format. */
export type ImageExtension = "jpg" | "png" | "webp";

/** Canonical MIME for each allowed extension. */
export type AllowedMime = "image/jpeg" | "image/png" | "image/webp";

const FORMAT_TO_EXTENSION: Readonly<Record<string, ImageExtension>> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
};

const EXTENSION_TO_MIME: Readonly<Record<ImageExtension, AllowedMime>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Maps an analyzer-reported format (e.g. `sharp`'s `"jpeg"`) to a safe, allowed
 * extension, or `null` when the format is missing/unsupported. The extension is
 * derived from the **real** decoded content, not the declared MIME, so a spoofed
 * MIME cannot drive the stored filename.
 */
export function formatToExtension(format: string | null): ImageExtension | null {
  if (format === null) return null;
  const ext = FORMAT_TO_EXTENSION[format.toLowerCase()];
  return ext ?? null;
}

/** Tunable validation limits (R3.3). */
export interface ImageValidationConfig {
  allowedMimeTypes?: readonly string[];
  maxBytes?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/** The facts about a downloaded image to validate. */
export interface ImageCandidate {
  /** Declared content type from the download, or `null` when absent. */
  contentType: string | null;
  sizeBytes: number;
  /** Real format reported by the analyzer (`sharp`), or `null` if unknown. */
  format: string | null;
  /** Pixel width when known, else `null` (dimensions are checked "when possible"). */
  width: number | null;
  height: number | null;
}

/** Why {@link validateImage} rejected an image (recorded as the reason, R3.4). */
export type ImageRejectionReason =
  | "empty"
  | "too_large"
  | "mime_not_allowed"
  | "extension_not_allowed"
  | "dimensions_out_of_range";

/** Discriminated result of {@link validateImage}. */
export type ValidateImageResult =
  | { ok: true; ext: ImageExtension; mime: AllowedMime }
  | { ok: false; reason: ImageRejectionReason };

/**
 * Validates a downloaded image (R3.3, R3.4).
 *
 * Accepts **iff** all of these hold: the declared MIME is allowed, the size is
 * positive and within the cap, the analyzed format maps to an allowed
 * extension, and — when width/height are known — both are within range. On
 * rejection it returns the first failing reason so the caller can record it.
 */
export function validateImage(
  candidate: ImageCandidate,
  config: ImageValidationConfig = {},
): ValidateImageResult {
  const allowedMimes = config.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const minWidth = config.minWidth ?? DEFAULT_MIN_DIMENSION;
  const minHeight = config.minHeight ?? DEFAULT_MIN_DIMENSION;
  const maxWidth = config.maxWidth ?? DEFAULT_MAX_DIMENSION;
  const maxHeight = config.maxHeight ?? DEFAULT_MAX_DIMENSION;

  if (!Number.isFinite(candidate.sizeBytes) || candidate.sizeBytes <= 0) {
    return { ok: false, reason: "empty" };
  }
  if (candidate.sizeBytes > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (candidate.contentType === null || !allowedMimes.includes(candidate.contentType)) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  const ext = formatToExtension(candidate.format);
  if (ext === null) {
    return { ok: false, reason: "extension_not_allowed" };
  }
  // Dimensions are validated only when both are known (R3.3, "when possible").
  if (candidate.width !== null && candidate.height !== null) {
    const dimsOk =
      candidate.width >= minWidth &&
      candidate.height >= minHeight &&
      candidate.width <= maxWidth &&
      candidate.height <= maxHeight;
    if (!dimsOk) {
      return { ok: false, reason: "dimensions_out_of_range" };
    }
  }
  return { ok: true, ext, mime: EXTENSION_TO_MIME[ext] };
}

// --- Injected effectful ports ----------------------------------------------

/** Image metadata as reported by a `sharp`-like analyzer. */
export interface ImageAnalysis {
  format: string | null;
  width: number | null;
  height: number | null;
}

/** Injected analyzer: bytes -> metadata. Production adapter wraps `sharp`. */
export type ImageAnalyzer = (bytes: Uint8Array) => Promise<ImageAnalysis>;

/** Input to the injected storage uploader. */
export interface StorageUploadInput {
  bucket: string;
  path: string;
  bytes: Uint8Array;
  contentType: AllowedMime;
}

/** Result of an upload: a stable public URL on success. */
export interface StorageUploadResult {
  ok: boolean;
  /** Stable, public Supabase Storage URL (never a Telegram URL). */
  publicUrl?: string;
  error?: string;
}

/** Injected uploader. Production adapter uses the service-role Storage client. */
export type StorageUploader = (
  input: StorageUploadInput,
) => Promise<StorageUploadResult>;

/** Injected dependencies for {@link processOfferImage}. */
export interface ProcessImageDeps {
  /** Downloads a Telegram file by id (bound to the token + fetch by the adapter). */
  fetchFile: (fileId: string) => Promise<FetchFileResult>;
  analyze: ImageAnalyzer;
  upload: StorageUploader;
  /** Safe filename id generator. Defaults to `crypto.randomUUID()`. */
  generateId?: () => string;
  config?: ImageValidationConfig;
  /** Target bucket. Defaults to {@link OFFER_IMAGES_BUCKET}. */
  bucket?: string;
  /** Fallback image URL. Defaults to {@link FALLBACK_IMAGE_URL}. */
  fallbackImageUrl?: string;
}

/** Every reason the processor may fall back for (R3.4, R3.8). */
export type ImageFailureReason =
  | "no_photo"
  | FetchFileRejectionReason
  | ImageRejectionReason
  | "analyze_failed"
  | "upload_failed";

/** Image stored successfully: a stable Storage URL + path (R3.5, R3.6). */
export interface ProcessImageReady {
  imageStatus: "ready";
  imageUrl: string;
  imageStoragePath: string;
  contentType: AllowedMime;
  width: number | null;
  height: number | null;
}

/** Image could not be stored: fallback image + recorded reason (R3.8). */
export interface ProcessImageFallback {
  imageStatus: "failed";
  imageUrl: string;
  imageStoragePath: null;
  reason: ImageFailureReason;
}

/** Discriminated result of {@link processOfferImage}. */
export type ProcessImageResult = ProcessImageReady | ProcessImageFallback;

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Runs the full image pipeline for an offer (R3.1–R3.8).
 *
 * Selects the best photo, downloads it, analyzes + validates it, then uploads
 * it under a safe `<uuid>.<ext>` name and returns the stable Storage public URL.
 * Any failure degrades to a fallback result (`image_status='failed'` + reason)
 * so the Offer is still saved and can be retried (R3.8). The returned `imageUrl`
 * is always a Storage URL or the local fallback — never a token-bearing Telegram
 * URL (R3.6).
 */
export async function processOfferImage(
  photos: readonly TelegramPhoto[],
  deps: ProcessImageDeps,
): Promise<ProcessImageResult> {
  const fallbackImageUrl = deps.fallbackImageUrl ?? FALLBACK_IMAGE_URL;
  const bucket = deps.bucket ?? OFFER_IMAGES_BUCKET;
  const generateId = deps.generateId ?? defaultId;

  const fallback = (reason: ImageFailureReason): ProcessImageFallback => ({
    imageStatus: "failed",
    imageUrl: fallbackImageUrl,
    imageStoragePath: null,
    reason,
  });

  const best = selectBestPhoto(photos);
  if (best === null) {
    return fallback("no_photo");
  }

  const downloaded = await deps.fetchFile(best.file_id);
  if (!downloaded.ok) {
    return fallback(downloaded.reason);
  }

  let analysis: ImageAnalysis;
  try {
    analysis = await deps.analyze(downloaded.bytes);
  } catch {
    return fallback("analyze_failed");
  }

  const verdict = validateImage(
    {
      contentType: downloaded.contentType,
      sizeBytes: downloaded.sizeBytes,
      format: analysis.format,
      width: analysis.width,
      height: analysis.height,
    },
    deps.config,
  );
  if (!verdict.ok) {
    return fallback(verdict.reason);
  }

  const path = `${generateId()}.${verdict.ext}`;
  let uploaded: StorageUploadResult;
  try {
    uploaded = await deps.upload({
      bucket,
      path,
      bytes: downloaded.bytes,
      contentType: verdict.mime,
    });
  } catch {
    return fallback("upload_failed");
  }
  if (!uploaded.ok || uploaded.publicUrl === undefined || uploaded.publicUrl === "") {
    return fallback("upload_failed");
  }

  return {
    imageStatus: "ready",
    imageUrl: uploaded.publicUrl,
    imageStoragePath: path,
    contentType: verdict.mime,
    width: analysis.width,
    height: analysis.height,
  };
}
