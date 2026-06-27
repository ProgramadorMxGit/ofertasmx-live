import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { IngestDeps } from "@/lib/telegram/ingest";
import { createSafeLogger, type SafeLogger } from "@/lib/telegram/secret";
import { FALLBACK_IMAGE_URL } from "@/lib/telegram/images";

import {
  AMAZON_URL_WRONG_TAG,
  DISALLOWED_URL,
  FALLBACK_IMAGE,
  READY_IMAGE,
  SAMPLE_PHOTO,
  buildUpdate,
  invalidPriceText,
  makeIngestDeps,
  offerText,
  priceUpdateText,
  type MadeDeps,
  type MakeDepsOptions,
} from "../fixtures/telegram";

/**
 * Integration tests for the Telegram webhook handler (Task 14.8) with **Supabase
 * and Telegram mocked** (R29.2). They drive the real `POST` route through every
 * guard and the full ingest pipeline (parser + SSRF link port + dedup + image +
 * persistence), using the in-memory persistence and a stub image port — no live
 * bot, network, database or real secrets.
 *
 * `@/lib/env.server` and `@/lib/telegram/webhook-deps` are mocked so the handler
 * uses a fake webhook secret and the in-memory deps instead of the service-role
 * Supabase client and `sharp`.
 */

/** Clearly-fake webhook secret; must equal `FAKE_WEBHOOK_SECRET` in fixtures. */
const VALID_SECRET = "fake-webhook-secret-FOR-TESTS-only";

// Mutable holder shared with the mocked module (hoisted above imports).
const mocks = vi.hoisted(() => ({
  holder: {
    deps: null as IngestDeps | null,
    logger: null as SafeLogger | null,
  },
}));

vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    SUPABASE_SERVICE_ROLE_KEY: "fake.service-role-key.FOR-TESTS-only",
    TELEGRAM_BOT_TOKEN: "000000:FAKE-bot-token-FOR-TESTS-only",
    TELEGRAM_WEBHOOK_SECRET: "fake-webhook-secret-FOR-TESTS-only",
    TELEGRAM_ALLOWED_CHAT_ID: 5054325626,
    ADMIN_EMAIL: "admin@example.test",
    AMAZON_TRACKING_ID: "programadormx-20",
    SHOW_AMAZON_PRICES: true,
    CRON_SECRET: "fake-cron-secret-FOR-TESTS-only",
  },
}));

vi.mock("@/lib/telegram/webhook-deps", () => ({
  createProductionIngestDeps: () => {
    if (mocks.holder.deps === null) throw new Error("test deps not initialized");
    return mocks.holder.deps;
  },
  createWebhookLogger: () => {
    if (mocks.holder.logger === null) throw new Error("test logger not initialized");
    return mocks.holder.logger;
  },
}));

// Import the route AFTER the mocks are registered.
import * as route from "@/app/api/telegram/webhook/route";

const WEBHOOK_URL = "https://site.test/api/telegram/webhook";

let made: MadeDeps;
let logSink: Mock;

function setup(options?: MakeDepsOptions): MadeDeps {
  made = makeIngestDeps(options);
  mocks.holder.deps = made.deps;
  return made;
}

beforeEach(() => {
  logSink = vi.fn();
  mocks.holder.logger = createSafeLogger({ secretValues: [VALID_SECRET], sink: logSink });
  made = setup();
});

/** POSTs an update with the valid secret by default. `secret: null` omits it. */
function post(update: unknown, opts: { secret?: string | null } = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret === undefined ? VALID_SECRET : opts.secret;
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  return route.POST(
    new Request(WEBHOOK_URL, { method: "POST", headers, body: JSON.stringify(update) }),
  );
}

/** POSTs a raw (possibly non-JSON) body with the valid secret. */
function postRaw(body: string): Promise<Response> {
  return route.POST(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": VALID_SECRET,
      },
      body,
    }),
  );
}

describe("method + runtime (R1.1, R1.2)", () => {
  it("runs on the Node.js runtime and exports only POST (other methods → 405 by the framework)", () => {
    expect(route.runtime).toBe("nodejs");
    expect((route as Record<string, unknown>).GET).toBeUndefined();
    expect(typeof route.POST).toBe("function");
  });
});

describe("secret guard (R1.3, R1.4)", () => {
  it("rejects an invalid secret with 401 and processes nothing", async () => {
    const response = await post(buildUpdate({ text: offerText() }), { secret: "the-wrong-secret" });
    expect(response.status).toBe(401);
    expect(made.persistence.offers).toHaveLength(0);
    expect(made.persistence.calls.claim).toBe(0);
  });

  it("rejects a missing secret header with 401", async () => {
    const response = await post(buildUpdate({ text: offerText() }), { secret: null });
    expect(response.status).toBe(401);
    expect(made.persistence.offers).toHaveLength(0);
  });

  it("accepts the valid secret (200) for an authorized, valid offer", async () => {
    const response = await post(buildUpdate({ text: offerText() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, outcome: "inserted" });
    expect(made.persistence.offers).toHaveLength(1);
    expect(made.persistence.offers[0].status).toBe("active");
  });
});

describe("body size + schema guards (R1.5, R1.6, R1.7)", () => {
  it("rejects an oversized body with 413 before parsing", async () => {
    const response = await post(buildUpdate({ text: "A".repeat(1_100_000) }));
    expect(response.status).toBe(413);
    expect(made.persistence.offers).toHaveLength(0);
  });

  it("rejects invalid JSON with 400", async () => {
    const response = await postRaw("{ not valid json");
    expect(response.status).toBe(400);
  });

  it("rejects a schema-invalid body with 400", async () => {
    const response = await post({ not: "a telegram update" });
    expect(response.status).toBe(400);
    expect(made.persistence.offers).toHaveLength(0);
  });
});

describe("authorized-chat gate (R1.10, R1.11)", () => {
  it("ignores a foreign chat with 200 and no persistence", async () => {
    const response = await post(buildUpdate({ chatId: 999999, text: offerText() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "ignored" });
    expect(made.persistence.offers).toHaveLength(0);
    expect(made.persistence.updates.size).toBe(0);
  });
});

describe("idempotency (R1.12)", () => {
  it("does not reprocess a duplicate update_id", async () => {
    const update = buildUpdate({ updateId: 10, messageId: 10, text: offerText() });

    const first = await post(update);
    const second = await post(update);

    expect(await first.json()).toMatchObject({ outcome: "inserted" });
    expect(await second.json()).toMatchObject({ outcome: "duplicate" });
    expect(made.persistence.offers).toHaveLength(1);
    expect(made.persistence.calls.insert).toBe(1);
  });
});

describe("new message ingestion", () => {
  it("ingests a new offer with a photo and stores the processed image", async () => {
    setup({ image: READY_IMAGE });
    const response = await post(
      buildUpdate({ photo: [SAMPLE_PHOTO], text: offerText() }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "inserted" });
    expect(made.image.calls).toBe(1);
    const offer = made.persistence.offers[0];
    expect(offer.image_url).toBe(READY_IMAGE.imageUrl);
    expect(offer.image_status).toBe("ready");
  });

  it("ingests a new offer without a photo using the fallback image", async () => {
    const response = await post(buildUpdate({ text: offerText() }));

    expect(await response.json()).toMatchObject({ outcome: "inserted" });
    expect(made.image.calls).toBe(0);
    const offer = made.persistence.offers[0];
    expect(offer.image_url).toBe(FALLBACK_IMAGE_URL);
    expect(offer.image_status).toBe("ready");
  });

  it("degrades to the fallback image (status pending) when image processing fails (R3.8)", async () => {
    setup({ image: FALLBACK_IMAGE });
    const response = await post(buildUpdate({ photo: [SAMPLE_PHOTO], text: offerText() }));

    expect(await response.json()).toMatchObject({ outcome: "inserted" });
    const offer = made.persistence.offers[0];
    expect(offer.image_url).toBe(FALLBACK_IMAGE_URL);
    expect(offer.image_status).toBe("pending");
    expect(offer.image_storage_path).toBeNull();
  });
});

describe("payload retention (R6.9, R6.10, R1.11)", () => {
  it("stores the raw update payload (incl. photo) for an authorized message", async () => {
    const update = buildUpdate({
      updateId: 40,
      messageId: 40,
      photo: [SAMPLE_PHOTO],
      text: offerText(),
    });
    const response = await post(update);

    expect(response.status).toBe(200);
    const stored = made.persistence.updates.get(40);
    expect(stored).toBeDefined();
    // The raw update is kept so the Cron can recover the photos for an image
    // retry (R6.9, R3.8); it must round-trip the original photo.
    expect(stored?.payload).not.toBeNull();
    expect(stored?.payload).toMatchObject({
      update_id: 40,
      message: { photo: [{ file_id: SAMPLE_PHOTO.file_id }] },
    });
  });

  it("persists no payload (and no row at all) for an unauthorized chat (R1.11)", async () => {
    const response = await post(
      buildUpdate({ chatId: 999999, photo: [SAMPLE_PHOTO], text: offerText() }),
    );

    expect(response.status).toBe(200);
    // R1.11: an unauthorized chat is ignored before the claim, so no payload —
    // indeed no `telegram_updates` row — is ever persisted.
    expect(made.persistence.updates.size).toBe(0);
  });
});

describe("edited message (R7.6, R7.7)", () => {
  it("updates the existing offer and writes an audit log", async () => {
    await post(buildUpdate({ updateId: 20, messageId: 20, text: offerText() }));
    expect(made.persistence.offers).toHaveLength(1);
    const offerId = made.persistence.offers[0].id;

    const edited = buildUpdate({
      updateId: 21,
      messageId: 20,
      kind: "edited_message",
      editDate: 1_700_000_100,
      text: priceUpdateText(),
    });
    const response = await post(edited);

    expect(await response.json()).toMatchObject({ outcome: "updated" });
    expect(made.persistence.offers).toHaveLength(1); // no duplicate (R7.6)
    expect(made.persistence.offers[0].current_price).toBe(799);
    expect(made.persistence.auditLogs).toHaveLength(1); // R7.7
    expect(made.persistence.auditLogs[0]).toMatchObject({ action: "edit", offer_id: offerId });
  });
});

describe("rejections and review flags (R4.10, R4.11, R5.2, R5.8)", () => {
  it("rejects an offer with an impossible price (200, no offer)", async () => {
    const response = await post(buildUpdate({ text: invalidPriceText() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "rejected" });
    expect(made.persistence.offers).toHaveLength(0);
    expect([...made.persistence.updates.values()][0].processing_status).toBe("rejected");
  });

  it("rejects an offer whose only link is a disallowed domain (R5.2)", async () => {
    const response = await post(buildUpdate({ text: offerText(DISALLOWED_URL) }));
    expect(await response.json()).toMatchObject({ outcome: "rejected" });
    expect(made.persistence.offers).toHaveLength(0);
  });

  it("persists an offer with a mismatched affiliate tag as needs_review (R5.8)", async () => {
    const response = await post(buildUpdate({ text: offerText(AMAZON_URL_WRONG_TAG) }));
    expect(await response.json()).toMatchObject({ outcome: "inserted" });
    const offer = made.persistence.offers[0];
    expect(offer.status).toBe("needs_review");
    expect(offer.needs_review).toBe(true);
  });
});

describe("price update via dedup (R7.3, R7.5)", () => {
  it("updates the existing offer (not a new one) on a repeated product at a new price", async () => {
    await post(buildUpdate({ updateId: 30, messageId: 30, text: offerText() }));
    const response = await post(buildUpdate({ updateId: 31, messageId: 31, text: priceUpdateText() }));

    expect(await response.json()).toMatchObject({ outcome: "updated" });
    expect(made.persistence.offers).toHaveLength(1);
    expect(made.persistence.offers[0].current_price).toBe(799);
    // A non-edit update writes no audit log (only edited_message does, R7.7).
    expect(made.persistence.auditLogs).toHaveLength(0);
  });
});

describe("secret hygiene (R1.16)", () => {
  it("never writes the webhook secret to any log line", async () => {
    await post(buildUpdate({ text: offerText() }), { secret: "the-wrong-secret" });
    await post(buildUpdate({ text: offerText() }));

    for (const call of logSink.mock.calls) {
      const line = String(call[1]);
      expect(line.includes(VALID_SECRET)).toBe(false);
    }
  });
});
