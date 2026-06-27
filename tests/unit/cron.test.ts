import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CRON_CONFIG,
  imageRetryBackoffMs,
  isImageRetryDue,
  runCronMaintenance,
  shouldExpire,
  type CronConfig,
  type CronDeps,
  type CronImageProcessor,
  type CronPersistencePort,
  type ExpirableOffer,
  type ImageRetryCandidate,
  type MarkImageFailedInput,
  type MarkImageReadyInput,
} from "@/lib/telegram/cron";
import type { ProcessImageResult } from "@/lib/telegram/images";

/**
 * Unit tests for the Cron maintenance core (Task 16.2, R3.8, R9.9, R9.10).
 *
 * Persistence and the image processor are injected mocks, so no live database,
 * bot or network is touched. The assertions: only offers with a past
 * `expires_at` are expired, a null `expires_at` is never expired (R9.9, R9.10),
 * and image retries respect the backoff — a too-recent attempt is skipped
 * (R3.8).
 */

const NOW = new Date("2024-06-01T12:00:00.000Z");

const READY: ProcessImageResult = {
  imageStatus: "ready",
  imageUrl: "https://proj.supabase.co/storage/v1/object/public/offer-images/x.jpg",
  imageStoragePath: "x.jpg",
  contentType: "image/jpeg",
  width: 800,
  height: 600,
};

const FAILED: ProcessImageResult = {
  imageStatus: "failed",
  imageUrl: "/fallback-offer.svg",
  imageStoragePath: null,
  reason: "download_failed",
};

/** Small, fast config so the backoff maths is easy to reason about. */
const CONFIG: CronConfig = {
  imageRetryBaseMs: 1000,
  imageRetryMaxMs: 100_000,
  maxImageRetries: 5,
  imageBatchLimit: 25,
};

interface ReadyCall {
  id: string;
  input: MarkImageReadyInput;
}
interface FailedCall {
  id: string;
  input: MarkImageFailedInput;
}

interface MockPersistence {
  port: CronPersistencePort;
  readyCalls: ReadyCall[];
  failedCalls: FailedCall[];
  expiredBatches: string[][];
}

function makePersistence(init: {
  imageCandidates?: ImageRetryCandidate[];
  activeOffers?: ExpirableOffer[];
}): MockPersistence {
  const readyCalls: ReadyCall[] = [];
  const failedCalls: FailedCall[] = [];
  const expiredBatches: string[][] = [];
  const port: CronPersistencePort = {
    findOffersNeedingImage: async (limit) => (init.imageCandidates ?? []).slice(0, limit),
    markImageReady: async (id, input) => {
      readyCalls.push({ id, input });
    },
    markImageRetryFailed: async (id, input) => {
      failedCalls.push({ id, input });
    },
    findActiveOffers: async () => init.activeOffers ?? [],
    markExpired: async (ids) => {
      expiredBatches.push([...ids]);
    },
  };
  return { port, readyCalls, failedCalls, expiredBatches };
}

function makeDeps(
  state: MockPersistence,
  processImage: CronImageProcessor,
  config?: Partial<CronConfig>,
): CronDeps {
  return { persistence: state.port, processImage, clock: () => NOW, config };
}

function offer(overrides: Partial<ImageRetryCandidate>): ImageRetryCandidate {
  return {
    id: "offer-1",
    telegramUpdateId: 100,
    imageRetryCount: 0,
    imageLastAttemptAt: null,
    ...overrides,
  };
}

describe("shouldExpire (R9.9, R9.10)", () => {
  it("expires an active offer whose expires_at is in the past", () => {
    expect(
      shouldExpire({ id: "a", status: "active", expiresAt: "2024-06-01T11:59:59.000Z" }, NOW),
    ).toBe(true);
  });

  it("expires an active offer whose expires_at equals now (<= comparison)", () => {
    expect(shouldExpire({ id: "a", status: "active", expiresAt: NOW.toISOString() }, NOW)).toBe(true);
  });

  it("does not expire an active offer whose expires_at is in the future", () => {
    expect(
      shouldExpire({ id: "a", status: "active", expiresAt: "2024-06-01T12:00:01.000Z" }, NOW),
    ).toBe(false);
  });

  it("never expires an offer with a null expires_at (R9.9)", () => {
    expect(shouldExpire({ id: "a", status: "active", expiresAt: null }, NOW)).toBe(false);
  });

  it("does not expire a non-active offer even if its expires_at has passed", () => {
    expect(
      shouldExpire({ id: "a", status: "hidden", expiresAt: "2000-01-01T00:00:00.000Z" }, NOW),
    ).toBe(false);
  });

  it("does not expire when the timestamp is unparseable", () => {
    expect(shouldExpire({ id: "a", status: "active", expiresAt: "not-a-date" }, NOW)).toBe(false);
  });
});

describe("imageRetryBackoffMs (R3.8)", () => {
  it("grows exponentially with the retry count", () => {
    expect(imageRetryBackoffMs(0, 1000, 999_999)).toBe(1000);
    expect(imageRetryBackoffMs(1, 1000, 999_999)).toBe(2000);
    expect(imageRetryBackoffMs(3, 1000, 999_999)).toBe(8000);
  });

  it("caps at the configured maximum", () => {
    expect(imageRetryBackoffMs(20, 1000, 5000)).toBe(5000);
  });

  it("treats negative/NaN counts as zero", () => {
    expect(imageRetryBackoffMs(-3, 1000, 999_999)).toBe(1000);
    expect(imageRetryBackoffMs(Number.NaN, 1000, 999_999)).toBe(1000);
  });
});

describe("isImageRetryDue (R3.8 backoff gate)", () => {
  it("is due when the image was never attempted by the cron", () => {
    expect(isImageRetryDue(offer({ imageLastAttemptAt: null }), NOW, CONFIG)).toBe(true);
  });

  it("is NOT due when the last attempt is too recent (within the backoff)", () => {
    const recent = new Date(NOW.getTime() - 500).toISOString(); // backoff for count 0 = 1000ms
    expect(isImageRetryDue(offer({ imageRetryCount: 0, imageLastAttemptAt: recent }), NOW, CONFIG)).toBe(
      false,
    );
  });

  it("becomes due once the backoff has elapsed", () => {
    const old = new Date(NOW.getTime() - 1500).toISOString();
    expect(isImageRetryDue(offer({ imageRetryCount: 0, imageLastAttemptAt: old }), NOW, CONFIG)).toBe(
      true,
    );
  });

  it("requires a longer wait for higher retry counts", () => {
    // count 2 → backoff 4000ms; only 3000ms elapsed → not due yet.
    const last = new Date(NOW.getTime() - 3000).toISOString();
    expect(isImageRetryDue(offer({ imageRetryCount: 2, imageLastAttemptAt: last }), NOW, CONFIG)).toBe(
      false,
    );
  });

  it("stops retrying after maxImageRetries is reached", () => {
    const ancient = new Date(NOW.getTime() - 10_000_000).toISOString();
    expect(isImageRetryDue(offer({ imageRetryCount: 5, imageLastAttemptAt: ancient }), NOW, CONFIG)).toBe(
      false,
    );
  });
});

describe("runCronMaintenance — expiration (R9.9, R9.10)", () => {
  it("expires only active offers whose expires_at is past; never null or future", async () => {
    const state = makePersistence({
      activeOffers: [
        { id: "past", status: "active", expiresAt: "2024-06-01T11:00:00.000Z" },
        { id: "future", status: "active", expiresAt: "2024-06-01T13:00:00.000Z" },
        { id: "no-expiry", status: "active", expiresAt: null },
      ],
    });
    const processImage = vi.fn<CronImageProcessor>(async () => READY);

    const result = await runCronMaintenance(makeDeps(state, processImage));

    expect(result.expiredOfferIds).toEqual(["past"]);
    expect(result.offersExpired).toBe(1);
    expect(state.expiredBatches).toEqual([["past"]]);
    // No image candidates → the image processor is never invoked.
    expect(processImage).not.toHaveBeenCalled();
  });

  it("never calls markExpired when only null/future offers exist", async () => {
    const state = makePersistence({
      activeOffers: [
        { id: "no-expiry", status: "active", expiresAt: null },
        { id: "future", status: "active", expiresAt: "2024-06-01T13:00:00.000Z" },
      ],
    });
    const processImage = vi.fn<CronImageProcessor>(async () => READY);

    const result = await runCronMaintenance(makeDeps(state, processImage));

    expect(result.offersExpired).toBe(0);
    expect(state.expiredBatches).toEqual([]);
  });
});

describe("runCronMaintenance — image retry (R3.8)", () => {
  it("skips a candidate whose backoff has not elapsed (too recent)", async () => {
    const recent = new Date(NOW.getTime() - 100).toISOString();
    const state = makePersistence({
      imageCandidates: [offer({ id: "o1", imageRetryCount: 0, imageLastAttemptAt: recent })],
    });
    const processImage = vi.fn<CronImageProcessor>(async () => READY);

    const result = await runCronMaintenance(makeDeps(state, processImage, CONFIG));

    expect(processImage).not.toHaveBeenCalled();
    expect(result.imagesSkipped).toBe(1);
    expect(result.imagesAttempted).toBe(0);
    expect(state.readyCalls).toEqual([]);
    expect(state.failedCalls).toEqual([]);
  });

  it("recovers a due image and marks it ready with the stable Storage URL", async () => {
    const state = makePersistence({
      imageCandidates: [offer({ id: "o1", imageRetryCount: 1, imageLastAttemptAt: null })],
    });
    const processImage = vi.fn<CronImageProcessor>(async () => READY);

    const result = await runCronMaintenance(makeDeps(state, processImage, CONFIG));

    expect(processImage).toHaveBeenCalledTimes(1);
    expect(result.imagesRecovered).toBe(1);
    expect(result.imagesAttempted).toBe(1);
    expect(state.readyCalls).toHaveLength(1);
    expect(state.readyCalls[0]).toMatchObject({
      id: "o1",
      input: { imageUrl: READY.imageUrl, imageStoragePath: "x.jpg", attemptAt: NOW.toISOString() },
    });
    expect(state.failedCalls).toEqual([]);
  });

  it("bumps the retry count and last-attempt timestamp when the retry fails again", async () => {
    const old = new Date(NOW.getTime() - 50_000).toISOString();
    const state = makePersistence({
      imageCandidates: [offer({ id: "o1", imageRetryCount: 2, imageLastAttemptAt: old })],
    });
    const processImage = vi.fn<CronImageProcessor>(async () => FAILED);

    const result = await runCronMaintenance(makeDeps(state, processImage, CONFIG));

    expect(processImage).toHaveBeenCalledTimes(1);
    expect(result.imagesFailed).toBe(1);
    expect(state.failedCalls).toHaveLength(1);
    expect(state.failedCalls[0]).toMatchObject({
      id: "o1",
      input: { retryCount: 3, attemptAt: NOW.toISOString(), status: "failed" },
    });
    expect(state.readyCalls).toEqual([]);
  });

  it("uses the default config when none is supplied", () => {
    // Sanity check on the shipped defaults used by the production route.
    expect(DEFAULT_CRON_CONFIG.maxImageRetries).toBeGreaterThan(0);
    expect(DEFAULT_CRON_CONFIG.imageRetryMaxMs).toBeGreaterThanOrEqual(
      DEFAULT_CRON_CONFIG.imageRetryBaseMs,
    );
  });
});
