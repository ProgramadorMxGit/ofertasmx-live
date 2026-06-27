import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import { createProductionImageDeps } from "@/lib/telegram/adapters";
import {
  FALLBACK_IMAGE_URL,
  processOfferImage,
  type ProcessImageResult,
} from "@/lib/telegram/images";
import { extractUpdate, parseUpdate } from "@/lib/telegram/schema";
import {
  type CronDeps,
  type CronImageProcessor,
  type CronPersistencePort,
  type ExpirableOffer,
  type ImageRetryCandidate,
  type MarkImageFailedInput,
  type MarkImageReadyInput,
} from "@/lib/telegram/cron";

/**
 * Production wiring for the Cron maintenance core (`server-only`).
 *
 * This is the single place {@link CronDeps} becomes real I/O: the service-role
 * Supabase client (persistence), `processOfferImage` bound to `sharp` + Storage
 * (image retry) and the system clock. The pure core (`lib/telegram/cron.ts`)
 * stays testable with mocks; only this file touches the database and the
 * network (R8.5, R8.7).
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

interface ImageRow {
  id: string;
  telegram_update_id: number;
  image_retry_count: number;
  image_last_attempt_at: string | null;
}

interface ExpirableRow {
  id: string;
  status: ExpirableOffer["status"];
  expires_at: string | null;
}

/**
 * Builds the service-role-backed {@link CronPersistencePort}. All errors
 * propagate so the route can answer 5xx (the next Cron tick retries safely).
 */
export function createSupabaseCronPersistence(client: ServiceClient): CronPersistencePort {
  return {
    async findOffersNeedingImage(limit: number): Promise<ImageRetryCandidate[]> {
      const { data, error } = await client
        .from("offers")
        .select("id, telegram_update_id, image_retry_count, image_last_attempt_at")
        .in("image_status", ["pending", "failed"])
        .order("image_last_attempt_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error !== null) throw error;
      return ((data as ImageRow[] | null) ?? []).map((row) => ({
        id: row.id,
        telegramUpdateId: row.telegram_update_id,
        imageRetryCount: row.image_retry_count,
        imageLastAttemptAt: row.image_last_attempt_at,
      }));
    },

    async markImageReady(offerId: string, input: MarkImageReadyInput): Promise<void> {
      const { error } = await client
        .from("offers")
        .update({
          image_url: input.imageUrl,
          image_storage_path: input.imageStoragePath,
          image_status: "ready",
          image_last_attempt_at: input.attemptAt,
          updated_at: input.attemptAt,
        })
        .eq("id", offerId);
      if (error !== null) throw error;
    },

    async markImageRetryFailed(offerId: string, input: MarkImageFailedInput): Promise<void> {
      const { error } = await client
        .from("offers")
        .update({
          image_status: input.status,
          image_retry_count: input.retryCount,
          image_last_attempt_at: input.attemptAt,
        })
        .eq("id", offerId);
      if (error !== null) throw error;
    },

    async findActiveOffers(): Promise<ExpirableOffer[]> {
      // Pre-narrow to offers that *can* expire: a null `expires_at` never
      // expires by time (R9.9), so it need not be fetched. `shouldExpire` in the
      // core remains the authoritative gate (defence in depth).
      const { data, error } = await client
        .from("offers")
        .select("id, status, expires_at")
        .eq("status", "active")
        .not("expires_at", "is", null);
      if (error !== null) throw error;
      return ((data as ExpirableRow[] | null) ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        expiresAt: row.expires_at,
      }));
    },

    async markExpired(offerIds: readonly string[]): Promise<void> {
      if (offerIds.length === 0) return;
      const { error } = await client
        .from("offers")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .in("id", [...offerIds])
        // Only expire if still active — guards against a concurrent edit.
        .eq("status", "active");
      if (error !== null) throw error;
    },
  };
}

/**
 * Builds the production image retry processor. It recovers the original photos
 * from the stored raw update payload (`telegram_updates.payload`, R6.9/R6.10)
 * and reprocesses them through `processOfferImage` (R3.8). When no payload or
 * photo is available it degrades to a fallback so the core bumps the backoff
 * rather than throwing.
 */
export function createCronImageProcessor(client: ServiceClient): CronImageProcessor {
  const imageDeps = createProductionImageDeps();
  const fallback = (): ProcessImageResult => ({
    imageStatus: "failed",
    imageUrl: FALLBACK_IMAGE_URL,
    imageStoragePath: null,
    reason: "no_photo",
  });

  return async (candidate: ImageRetryCandidate): Promise<ProcessImageResult> => {
    const { data, error } = await client
      .from("telegram_updates")
      .select("payload")
      .eq("update_id", candidate.telegramUpdateId)
      .maybeSingle();
    if (error !== null || data === null) return fallback();

    const payload = (data as { payload: unknown }).payload;
    if (payload === null || payload === undefined) return fallback();

    const parsed = parseUpdate(payload);
    if (!parsed.ok) return fallback();
    const extracted = extractUpdate(parsed.update);
    if (extracted === null || extracted.photo.length === 0) return fallback();

    return processOfferImage(extracted.photo, imageDeps);
  };
}

/** Assembles the production {@link CronDeps} consumed by the Cron route. */
export function createProductionCronDeps(): CronDeps {
  const client = createServiceRoleClient();
  return {
    persistence: createSupabaseCronPersistence(client),
    processImage: createCronImageProcessor(client),
    clock: () => new Date(),
  };
}
