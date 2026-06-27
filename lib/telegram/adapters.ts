import "server-only";

import sharp from "sharp";

import { serverEnv } from "@/lib/env.server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  fetchTelegramFile,
  type FetchResponseLike,
  type FetchFileResult,
  type TelegramFetchFn,
} from "@/lib/telegram/files";
import {
  OFFER_IMAGES_BUCKET,
  type ImageAnalysis,
  type ImageAnalyzer,
  type ProcessImageDeps,
  type StorageUploader,
} from "@/lib/telegram/images";

/**
 * Production wiring for the Image Processor (`server-only`).
 *
 * This is the only place the injected ports become real I/O. It is the
 * "production caller" that reads the Bot Token from {@link serverEnv} and binds
 * `sharp` (analysis + variants) and the service-role Supabase Storage client
 * (upload), so `files.ts`/`images.ts` stay pure-by-injection and unit-testable
 * with fixtures. The webhook (Task 14) and Cron (Task 16) consume
 * {@link createProductionImageDeps}.
 *
 * SECURITY: the token lives only in `serverEnv` here and is passed straight into
 * {@link fetchTelegramFile}, which never logs nor returns it; the stored URL is
 * the bucket's stable public URL, never a token-bearing Telegram URL (R3.6,
 * R1.16, R8.7).
 */

/** Wrap the global `fetch` to the minimal shape the downloader expects. */
const globalFetch: TelegramFetchFn = (url, init) =>
  fetch(url, init) as Promise<FetchResponseLike>;

/** `sharp`-backed analyzer: reads format + dimensions from the bytes (R3.3). */
export const sharpAnalyzer: ImageAnalyzer = async (
  bytes: Uint8Array,
): Promise<ImageAnalysis> => {
  const metadata = await sharp(Buffer.from(bytes)).metadata();
  return {
    format: metadata.format ?? null,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
};

/** Options for {@link createTelegramFileFetcher}. */
export interface TelegramFetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Builds the production `fetchFile` bound to `TELEGRAM_BOT_TOKEN` and the real
 * `fetch`. The token never leaves `serverEnv`/this closure (R3.2, R1.16).
 */
export function createTelegramFileFetcher(
  options: TelegramFetcherOptions = {},
): (fileId: string) => Promise<FetchFileResult> {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  return (fileId: string) =>
    fetchTelegramFile(
      { fileId },
      {
        token,
        fetch: globalFetch,
        timeoutMs: options.timeoutMs,
        maxBytes: options.maxBytes,
      },
    );
}

/**
 * Builds the service-role Storage uploader for the `offer-images` bucket
 * (server write only, public read — R3.5, R3.6). Returns the bucket's stable
 * public URL on success.
 */
export function createSupabaseStorageUploader(
  bucket: string = OFFER_IMAGES_BUCKET,
): StorageUploader {
  const client = createServiceRoleClient();
  return async ({ path, bytes, contentType }) => {
    const { error } = await client.storage
      .from(bucket)
      .upload(path, bytes, { contentType, upsert: false });
    if (error) {
      return { ok: false, error: error.message };
    }
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return { ok: true, publicUrl: data.publicUrl };
  };
}

/** Assembles the production {@link ProcessImageDeps} for `processOfferImage`. */
export function createProductionImageDeps(
  options: TelegramFetcherOptions = {},
): ProcessImageDeps {
  return {
    fetchFile: createTelegramFileFetcher(options),
    analyze: sharpAnalyzer,
    upload: createSupabaseStorageUploader(),
  };
}
