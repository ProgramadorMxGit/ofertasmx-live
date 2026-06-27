/**
 * Cron maintenance core (R3.8, R9.9, R9.10).
 *
 * Pure-by-injection logic behind `app/api/cron/route.ts`. The route only checks
 * the `CRON_SECRET` and wires the production ports; everything below is testable
 * with in-memory mocks — no live database, bot, network or `sharp`.
 *
 * Two jobs run on every invocation:
 *
 *  1. **Image retry (R3.8).** Offers whose `image_status` is `pending`/`failed`
 *     are retried through the injected image processor, gated by a backoff on
 *     `image_retry_count` + `image_last_attempt_at` so an offer is not retried
 *     too soon. On success the offer is marked `ready` with the stable Storage
 *     URL + path; on failure the retry count and last-attempt timestamp are
 *     bumped so the backoff grows.
 *
 *  2. **Expiration (R9.9, R9.10).** Offers that are `active`, have a non-null
 *     `expires_at` and whose `expires_at <= now` are marked `expired`. Offers
 *     with a null `expires_at` are **never** expired by time. The authoritative
 *     rule is the pure {@link shouldExpire}; the resulting UPDATEs propagate to
 *     clients via Supabase Realtime automatically (no extra work here, R9.10).
 *
 * The decision logic ({@link shouldExpire}, {@link isImageRetryDue},
 * {@link imageRetryBackoffMs}) is exported as pure functions so it can be unit
 * tested directly in addition to through {@link runCronMaintenance}.
 */

import type { ProcessImageResult } from "@/lib/telegram/images";
import type { Enums } from "@/lib/supabase/types";

type OfferStatus = Enums<"offer_status">;

// --- Image retry backoff (R3.8) --------------------------------------------

/** Tunable cron limits. All have safe defaults. */
export interface CronConfig {
  /** Base wait before the first retry, in ms. Default 5 minutes. */
  imageRetryBaseMs: number;
  /** Cap on the backoff wait, in ms. Default 6 hours. */
  imageRetryMaxMs: number;
  /** Stop retrying an image after this many attempts. Default 8. */
  maxImageRetries: number;
  /** Max offers to consider for image retry per run. Default 25. */
  imageBatchLimit: number;
}

/** Default cron configuration. */
export const DEFAULT_CRON_CONFIG: CronConfig = {
  imageRetryBaseMs: 5 * 60 * 1000,
  imageRetryMaxMs: 6 * 60 * 60 * 1000,
  maxImageRetries: 8,
  imageBatchLimit: 25,
};

/**
 * Exponential backoff (in ms) before the next retry, given how many attempts
 * have already failed: `min(base * 2^retryCount, max)`. A negative/NaN count is
 * treated as 0. Pure (R3.8).
 */
export function imageRetryBackoffMs(
  retryCount: number,
  baseMs: number,
  maxMs: number,
): number {
  const safeCount = Number.isFinite(retryCount) && retryCount > 0 ? Math.floor(retryCount) : 0;
  const wait = baseMs * 2 ** safeCount;
  return Math.min(wait, maxMs);
}

/** An offer that may need its image (re)processed. */
export interface ImageRetryCandidate {
  id: string;
  /** Source Telegram update id — the production adapter uses it to find the
   *  stored payload (photos) to reprocess. Unused by the pure core. */
  telegramUpdateId: number;
  imageRetryCount: number;
  /** ISO timestamp of the last cron attempt, or `null` if never attempted. */
  imageLastAttemptAt: string | null;
}

/**
 * Whether an image retry is due now (R3.8): `true` when the offer has not
 * exceeded {@link CronConfig.maxImageRetries} and enough time has passed since
 * the last attempt (a never-attempted offer is always due). Pure.
 */
export function isImageRetryDue(
  candidate: ImageRetryCandidate,
  now: Date,
  config: CronConfig,
): boolean {
  if (candidate.imageRetryCount >= config.maxImageRetries) {
    return false;
  }
  if (candidate.imageLastAttemptAt === null) {
    return true;
  }
  const lastAttempt = new Date(candidate.imageLastAttemptAt).getTime();
  if (!Number.isFinite(lastAttempt)) {
    // Unparseable timestamp: do not block retries on bad data.
    return true;
  }
  const elapsed = now.getTime() - lastAttempt;
  const wait = imageRetryBackoffMs(
    candidate.imageRetryCount,
    config.imageRetryBaseMs,
    config.imageRetryMaxMs,
  );
  return elapsed >= wait;
}

// --- Expiration (R9.9, R9.10) ----------------------------------------------

/** The minimal offer facts needed to decide expiration. */
export interface ExpirableOffer {
  id: string;
  status: OfferStatus;
  /** ISO timestamp, or `null` when the offer never expires by time (R9.9). */
  expiresAt: string | null;
}

/**
 * Authoritative expiration rule (R9.9, R9.10): an offer expires **iff** it is
 * `active`, has a non-null `expires_at` and that instant is at/after `now`. A
 * null `expires_at` is never expired by time. Pure.
 */
export function shouldExpire(offer: ExpirableOffer, now: Date): boolean {
  if (offer.status !== "active") return false;
  if (offer.expiresAt === null) return false;
  const expiresAt = new Date(offer.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= now.getTime();
}

// --- Injected ports --------------------------------------------------------

/** On a successful image retry. */
export interface MarkImageReadyInput {
  imageUrl: string;
  imageStoragePath: string;
  attemptAt: string;
}

/** On a failed image retry. */
export interface MarkImageFailedInput {
  retryCount: number;
  attemptAt: string;
  status: "failed";
}

/**
 * The persistence boundary (injected). The production adapter implements it with
 * the service-role Supabase client; tests use an in-memory mock.
 */
export interface CronPersistencePort {
  /** Offers with `image_status` in (`pending`,`failed`), up to `limit` (R3.8). */
  findOffersNeedingImage(limit: number): Promise<ImageRetryCandidate[]>;
  /** Store the recovered image and mark the offer `ready` (R3.8). */
  markImageReady(offerId: string, input: MarkImageReadyInput): Promise<void>;
  /** Bump the retry count + last-attempt timestamp after a failed retry (R3.8). */
  markImageRetryFailed(offerId: string, input: MarkImageFailedInput): Promise<void>;
  /** Active offers to evaluate for expiry. The production query may pre-narrow to
   *  `expires_at is not null`; {@link shouldExpire} is still the gate (R9.9). */
  findActiveOffers(): Promise<ExpirableOffer[]>;
  /** Set `status='expired'` for the given offer ids (R9.10). Realtime auto-propagates. */
  markExpired(offerIds: readonly string[]): Promise<void>;
}

/** (Re)processes the image for one offer; returns ready or a fallback (R3.8). */
export type CronImageProcessor = (
  candidate: ImageRetryCandidate,
) => Promise<ProcessImageResult>;

/** Injected dependencies for {@link runCronMaintenance}. */
export interface CronDeps {
  persistence: CronPersistencePort;
  processImage: CronImageProcessor;
  /** Time source, injected for deterministic tests. */
  clock: () => Date;
  /** Optional overrides merged onto {@link DEFAULT_CRON_CONFIG}. */
  config?: Partial<CronConfig>;
}

/** Summary of a maintenance run (no secrets). */
export interface CronResult {
  /** Image retries actually attempted (past the backoff gate). */
  imagesAttempted: number;
  /** Retries that recovered a real image. */
  imagesRecovered: number;
  /** Retries that failed again. */
  imagesFailed: number;
  /** Candidates skipped because their backoff had not elapsed / cap reached. */
  imagesSkipped: number;
  /** Offers transitioned to `expired` this run. */
  offersExpired: number;
  /** Ids of the expired offers. */
  expiredOfferIds: string[];
}

/**
 * Runs both maintenance jobs (R3.8, R9.9, R9.10). See the module docstring for
 * ordering and guarantees. Image retries run first (so newly-recovered offers
 * are not concurrently considered for expiry), then expiration.
 */
export async function runCronMaintenance(deps: CronDeps): Promise<CronResult> {
  const config: CronConfig = { ...DEFAULT_CRON_CONFIG, ...deps.config };
  const now = deps.clock();
  const nowIso = now.toISOString();

  // --- 1. Image retry with backoff (R3.8) ---------------------------------
  let imagesAttempted = 0;
  let imagesRecovered = 0;
  let imagesFailed = 0;
  let imagesSkipped = 0;

  const candidates = await deps.persistence.findOffersNeedingImage(config.imageBatchLimit);
  for (const candidate of candidates) {
    if (!isImageRetryDue(candidate, now, config)) {
      imagesSkipped += 1;
      continue;
    }
    imagesAttempted += 1;
    const result = await deps.processImage(candidate);
    if (result.imageStatus === "ready") {
      await deps.persistence.markImageReady(candidate.id, {
        imageUrl: result.imageUrl,
        imageStoragePath: result.imageStoragePath,
        attemptAt: nowIso,
      });
      imagesRecovered += 1;
    } else {
      await deps.persistence.markImageRetryFailed(candidate.id, {
        retryCount: candidate.imageRetryCount + 1,
        attemptAt: nowIso,
        status: "failed",
      });
      imagesFailed += 1;
    }
  }

  // --- 2. Expiration (R9.9, R9.10) ----------------------------------------
  const activeOffers = await deps.persistence.findActiveOffers();
  const expiredOfferIds = activeOffers
    .filter((offer) => shouldExpire(offer, now))
    .map((offer) => offer.id);
  if (expiredOfferIds.length > 0) {
    await deps.persistence.markExpired(expiredOfferIds);
  }

  return {
    imagesAttempted,
    imagesRecovered,
    imagesFailed,
    imagesSkipped,
    offersExpired: expiredOfferIds.length,
    expiredOfferIds,
  };
}
