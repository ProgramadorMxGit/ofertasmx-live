/**
 * Shared fixtures for webhook tests: update builders, clearly-fake secret
 * sentinels, sample offer messages and an {@link IngestDeps} factory wired to
 * the in-memory persistence + the *real* SSRF link port and dedup logic.
 *
 * No real bot, network, database or secrets: the image port is a stub and the
 * secrets below are obviously fake sentinels, never real credentials.
 */

import { createLinkPort } from "@/lib/ssrf/identify";
import { FALLBACK_IMAGE_URL, type ProcessImageResult } from "@/lib/telegram/images";
import type { TelegramPhoto } from "@/lib/telegram/files";
import type { IngestDeps, IngestImageProcessor } from "@/lib/telegram/ingest";
import type { TelegramUpdate, UpdateKind } from "@/lib/telegram/schema";

import { createInMemoryPersistence, type InMemoryPersistence } from "./persistence";

/** The Chat Autorizado (`chat.id`) (R1.10). */
export const AUTHORIZED_CHAT_ID = 5054325626;

/** The Amazon tracking id the webhook expects (R5.7). */
export const TRACKING_ID = "programadormx-20";

// --- Clearly-fake secret sentinels (never real credentials) ----------------
export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret-FOR-TESTS-only";
export const FAKE_BOT_TOKEN = "000000:FAKE-bot-token-FOR-TESTS-only";
export const FAKE_SERVICE_ROLE_KEY = "fake.service-role-key.FOR-TESTS-only";

/** A usable high-resolution photo. */
export const SAMPLE_PHOTO: TelegramPhoto = {
  file_id: "file-big",
  file_unique_id: "uniq-big",
  width: 800,
  height: 600,
};

// --- Sample URLs -----------------------------------------------------------
export const AMAZON_ASIN = "B08ABCDEFG";
export const AMAZON_URL_OK = `https://www.amazon.com.mx/dp/${AMAZON_ASIN}?tag=${TRACKING_ID}`;
export const AMAZON_URL_WRONG_TAG = `https://www.amazon.com.mx/dp/${AMAZON_ASIN}?tag=someone-else-99`;
export const MELI_URL = "https://www.mercadolibre.com.mx/producto/p/MLM123456789";
export const DISALLOWED_URL = "https://deals.evil.example.com/dp/B08ABCDEFG";

/** A valid Amazon offer message (≈31% off, no review flag). */
export function offerText(url: string = AMAZON_URL_OK): string {
  return [
    "Audifonos Inalambricos Premium",
    "Antes $1,299.00",
    "Ahora $899.00",
    "31% de descuento",
    url,
  ].join("\n");
}

/** A valid Amazon offer at a *different* current price (for the dedup update case). */
export function priceUpdateText(url: string = AMAZON_URL_OK): string {
  return [
    "Audifonos Inalambricos Premium",
    "Antes $1,299.00",
    "Ahora $799.00",
    url,
  ].join("\n");
}

/** A message whose only price is impossible (current >= original) → rejected (R4.11). */
export function invalidPriceText(url: string = AMAZON_URL_OK): string {
  return ["Producto raro", "Antes $100.00", "Ahora $150.00", url].join("\n");
}

/** Options for {@link buildUpdate}. */
export interface BuildUpdateOptions {
  updateId?: number;
  messageId?: number;
  chatId?: number;
  kind?: UpdateKind;
  text?: string | null;
  caption?: string | null;
  photo?: TelegramPhoto[];
  date?: number;
  editDate?: number;
}

/** Builds a Telegram update placing the message under the requested kind. */
export function buildUpdate(options: BuildUpdateOptions = {}): TelegramUpdate {
  const kind = options.kind ?? "message";
  const message: Record<string, unknown> = {
    message_id: options.messageId ?? 1001,
    date: options.date ?? 1_700_000_000,
    chat: { id: options.chatId ?? AUTHORIZED_CHAT_ID },
  };
  if (options.editDate !== undefined) message.edit_date = options.editDate;
  if (options.text != null) message.text = options.text;
  if (options.caption != null) message.caption = options.caption;
  if (options.photo !== undefined) message.photo = options.photo;

  return { update_id: options.updateId ?? 5001, [kind]: message } as TelegramUpdate;
}

// --- Image port stubs ------------------------------------------------------
export const READY_IMAGE: ProcessImageResult = {
  imageStatus: "ready",
  imageUrl: "https://proj.supabase.co/storage/v1/object/public/offer-images/stored.jpg",
  imageStoragePath: "stored.jpg",
  contentType: "image/jpeg",
  width: 800,
  height: 600,
};

export const FALLBACK_IMAGE: ProcessImageResult = {
  imageStatus: "failed",
  imageUrl: FALLBACK_IMAGE_URL,
  imageStoragePath: null,
  reason: "download_failed",
};

/** Tracks calls made to the stub image processor. */
export interface ImageState {
  calls: number;
  lastPhotos: readonly TelegramPhoto[] | null;
}

/** Options for {@link makeIngestDeps}. */
export interface MakeDepsOptions {
  persistence?: InMemoryPersistence;
  /** Result the stub image processor returns. Defaults to {@link READY_IMAGE}. */
  image?: ProcessImageResult;
  authorizedChatId?: number;
  now?: Date;
}

/** What {@link makeIngestDeps} returns: the deps plus inspectable test handles. */
export interface MadeDeps {
  deps: IngestDeps;
  persistence: InMemoryPersistence;
  image: ImageState;
}

/**
 * Builds {@link IngestDeps} for tests: in-memory persistence, the real
 * `createLinkPort` (so parser + SSRF + dedup run for real), a stub image
 * processor and a fixed clock.
 */
export function makeIngestDeps(options: MakeDepsOptions = {}): MadeDeps {
  const persistence = options.persistence ?? createInMemoryPersistence();
  const imageResult = options.image ?? READY_IMAGE;
  const image: ImageState = { calls: 0, lastPhotos: null };
  const imageProcessor: IngestImageProcessor = async (photos) => {
    image.calls += 1;
    image.lastPhotos = photos;
    return imageResult;
  };
  const fixedNow = options.now ?? new Date("2024-01-01T00:00:00.000Z");

  const deps: IngestDeps = {
    persistence: persistence.port,
    linkPort: createLinkPort({ trackingId: TRACKING_ID }),
    imageProcessor,
    clock: () => fixedNow,
    authorizedChatId: options.authorizedChatId ?? AUTHORIZED_CHAT_ID,
  };

  return { deps, persistence, image };
}
