/**
 * Webhook ingestion pipeline (R1.10–R1.15, R7.3–R7.7, R3.8).
 *
 * {@link ingestUpdate} is the orchestration core that runs **after** the route
 * handler's transport guards (method/secret/size/Zod). Everything effectful is
 * an **injected port**, so the whole pipeline is exercised in integration tests
 * with in-memory mocks — no live database, bot or network. The route handler
 * (Task 14.5) is the only place that binds the real Supabase/Telegram/`sharp`
 * implementations (see `lib/telegram/webhook-deps.ts`).
 *
 * Pipeline, in order:
 *  1. **Authorized-chat gate** (R1.10, R1.11). Only `chat.id ===
 *     authorizedChatId` is processed; any other chat (or an update with no
 *     recognized message) is ignored *without persisting the payload* — only a
 *     technical event is logged by the caller, no personal data stored.
 *  2. **Idempotent claim** (R1.12). `INSERT ... ON CONFLICT(update_id) DO
 *     NOTHING` into `telegram_updates`. If the row already exists in a terminal
 *     state, the update is a duplicate and is *not* reprocessed. If it exists in
 *     a non-terminal state (`received`/`error`, e.g. a Telegram retry after a
 *     5xx), processing resumes safely (R1.15) — the dedup engine prevents a
 *     second offer.
 *  3. **Parse** the message via {@link parseOffer} with the injected SSRF-backed
 *     {@link LinkPort}. A price rejection, or the absence of an allowed-merchant
 *     link (the `offers.platform` column is `NOT NULL`), marks the update
 *     `rejected` and stops.
 *  4. **Identity**: compute the fingerprint and resolve duplicates against the
 *     injected candidate lookup (R7.1).
 *  5. **Persist**. On *insert*, process the image within budget (injected image
 *     port) — degrading to a fallback with `image_status` `pending`/`failed` so
 *     the Offer is still saved and the Cron can retry (R3.8) — then insert. On
 *     *update*, patch price/discount/dates while preserving slug and image
 *     (R7.3, R7.6) and emit `UPDATE` (R7.5). For an `edited_message`, write an
 *     `admin_audit_logs` entry (R7.7).
 *
 * A returned {@link IngestResult} always maps to a fast 200 (R1.14). Only an
 * unexpected *internal* failure (a port throws) propagates, so the route can
 * answer 5xx and Telegram retries safely (R1.15).
 */

import { computeFingerprint } from "@/lib/dedup/fingerprint";
import {
  resolveDuplicate,
  type CandidateIdentity,
  type OfferIdentity,
} from "@/lib/dedup/dedup";
import { generateSlug } from "@/lib/dedup/slug";
import { parseOffer, type LinkPort, type ParseInput, type Platform } from "@/lib/parser/parse";
import { extractUpdate, type ExtractedUpdate, type TelegramUpdate } from "@/lib/telegram/schema";
import type { SafeLogger } from "@/lib/telegram/secret";
import { FALLBACK_IMAGE_URL, type ProcessImageResult } from "@/lib/telegram/images";
import type { TelegramPhoto } from "@/lib/telegram/files";
import type { Enums, Json } from "@/lib/supabase/types";

/** Lifecycle status of a `telegram_updates` row. */
export type ProcessingStatus =
  | "received"
  | "processed"
  | "duplicate"
  | "ignored"
  | "rejected"
  | "error";

/**
 * States from which an update is **not** reprocessed (R1.12). `error` and
 * `received` are deliberately excluded so a Telegram retry after a transient
 * failure resumes safely (R1.15).
 */
export const TERMINAL_STATUSES: readonly ProcessingStatus[] = [
  "processed",
  "duplicate",
  "ignored",
  "rejected",
];

type OfferStatus = Enums<"offer_status">;

/** Input to {@link PersistencePort.claimUpdate}. */
export interface ClaimUpdateInput {
  updateId: number;
  messageId: number | null;
  chatId: number | null;
  updateType: string | null;
  /**
   * The raw validated update, persisted as `telegram_updates.payload` so the
   * Cron can recover the original photos for an image retry (R6.9, R3.8) and
   * for debugging (R6.10). Only the authorized-chat path reaches the claim, so
   * payloads are stored for authorized chats only (R1.11).
   */
  payload?: Json;
}

/** Result of the idempotent claim (R1.12). */
export interface ClaimResult {
  /** `true` when this call inserted the row (first time seen). */
  inserted: boolean;
  /** The prior status when the row already existed, else `null`. */
  existingStatus: ProcessingStatus | null;
}

/** A new offer to persist (insert path). Prices are exact decimals as numbers. */
export interface OfferInsert {
  platform: Platform;
  merchant: string;
  external_product_id: string | null;
  fingerprint: string;
  telegram_chat_id: number;
  telegram_message_id: number;
  telegram_update_id: number;
  title: string;
  slug: string;
  image_url: string | null;
  image_storage_path: string | null;
  image_status: "ready" | "pending" | "failed";
  original_price: number | null;
  current_price: number;
  discount_percent: number | null;
  currency: string;
  affiliate_url: string;
  affiliate_tag: string | null;
  status: OfferStatus;
  needs_review: boolean;
  raw_text: string;
  published_at: string | null;
}

/** The price/discount/freshness patch applied on an update (R7.3). */
export interface OfferPatch {
  current_price: number;
  original_price: number | null;
  discount_percent: number | null;
  needs_review: boolean;
  last_verified_at: string;
  updated_at: string;
}

/** An audit-log entry written when an `edited_message` is processed (R7.7). */
export interface AuditLogEntry {
  action: string;
  offer_id: string | null;
  actor_email: string | null;
  details: Json;
}

/**
 * The persistence boundary (injected). The production adapter implements it with
 * the service-role Supabase client; tests use an in-memory mock that enforces
 * the same uniqueness invariants (`update_id` PK, `(chat,message)` unique).
 */
export interface PersistencePort {
  /** `INSERT ... ON CONFLICT(update_id) DO NOTHING`, reporting the prior state (R1.12). */
  claimUpdate(input: ClaimUpdateInput): Promise<ClaimResult>;
  /** Set the terminal status (+ optional technical error) for an update. */
  finalizeUpdate(
    updateId: number,
    status: ProcessingStatus,
    errorMessage: string | null,
  ): Promise<void>;
  /** Existing offers an incoming identity may match against (R7.1). */
  findCandidates(identity: OfferIdentity): Promise<CandidateIdentity[]>;
  /** Insert a new offer, returning its id. Must enforce `(chat,message)` uniqueness. */
  insertOffer(offer: OfferInsert): Promise<{ id: string }>;
  /** Patch an existing offer in place (price/discount/dates; slug + image preserved). */
  updateOffer(id: string, patch: OfferPatch): Promise<void>;
  /** Append an audit-log row (R7.7). */
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
}

/** Processes a message's photos into a stored image or a fallback (R3.1–R3.8). */
export type IngestImageProcessor = (
  photos: readonly TelegramPhoto[],
) => Promise<ProcessImageResult>;

/** Injected dependencies for {@link ingestUpdate}. */
export interface IngestDeps {
  persistence: PersistencePort;
  /** SSRF-backed link detector (`createLinkPort` from `@/lib/ssrf`). */
  linkPort: LinkPort;
  imageProcessor: IngestImageProcessor;
  /** Time source, injected for deterministic tests. */
  clock: () => Date;
  /** The authorized chat id (R1.10); production passes `TELEGRAM_ALLOWED_CHAT_ID`. */
  authorizedChatId: number;
  /** Fallback image URL. Defaults to {@link FALLBACK_IMAGE_URL}. */
  fallbackImageUrl?: string;
  /** Optional secret-safe logger for technical events (R1.7, R1.11, R1.16). */
  logger?: SafeLogger;
}

/** What happened to an update. All outcomes map to a fast HTTP 200 (R1.14). */
export type IngestOutcome = "ignored" | "duplicate" | "rejected" | "inserted" | "updated";

/** The result of {@link ingestUpdate}, describing the realtime effect (R7.5). */
export interface IngestResult {
  outcome: IngestOutcome;
  /** Terminal status written to `telegram_updates`. */
  status: ProcessingStatus;
  offerId: string | null;
  /** Realtime event for the offers channel, or `null` when nothing was published. */
  realtimeEvent: "INSERT" | "UPDATE" | null;
  /** Machine-readable reason for ignore/reject (technical, no personal data). */
  reason: string | null;
  /** The persisted offer status, when an offer was written. */
  offerStatus: OfferStatus | null;
}

function ignored(reason: string): IngestResult {
  return {
    outcome: "ignored",
    status: "ignored",
    offerId: null,
    realtimeEvent: null,
    reason,
    offerStatus: null,
  };
}

/**
 * Runs the ingestion pipeline for a Zod-validated update. See the module
 * docstring for the full ordering and guarantees. Throws only on an unexpected
 * internal port failure, which the route maps to 5xx for a safe Telegram retry
 * (R1.15).
 */
export async function ingestUpdate(
  rawUpdate: TelegramUpdate,
  deps: IngestDeps,
): Promise<IngestResult> {
  const fallbackImageUrl = deps.fallbackImageUrl ?? FALLBACK_IMAGE_URL;
  const nowIso = deps.clock().toISOString();

  const extracted = extractUpdate(rawUpdate);

  // --- 1. Authorized-chat gate (R1.10, R1.11) ------------------------------
  // Unrecognized update or any other chat: ignore silently, do NOT persist the
  // payload (no unnecessary personal data), only a technical event is logged.
  if (extracted === null) {
    deps.logger?.info("telegram.update.ignored", {
      update_id: rawUpdate.update_id,
      reason: "unsupported_update",
    });
    return ignored("unsupported_update");
  }
  if (extracted.chatId !== deps.authorizedChatId) {
    deps.logger?.info("telegram.update.ignored", {
      update_id: extracted.updateId,
      reason: "unauthorized_chat",
    });
    return ignored("unauthorized_chat");
  }

  // --- 2. Idempotent claim (R1.12) -----------------------------------------
  const claim = await deps.persistence.claimUpdate({
    updateId: extracted.updateId,
    messageId: extracted.messageId,
    chatId: extracted.chatId,
    updateType: extracted.kind,
    // Store the raw validated update so the Cron can recover the photos for an
    // image retry (R6.9, R3.8). It came from `JSON.parse` + Zod, so it is valid
    // JSON; the `as unknown as Json` bridges the `.passthrough()` schema's
    // `unknown`-valued index signature, which is not assignable to `Json`.
    payload: rawUpdate as unknown as Json,
  });
  if (
    !claim.inserted &&
    claim.existingStatus !== null &&
    TERMINAL_STATUSES.includes(claim.existingStatus)
  ) {
    deps.logger?.info("telegram.update.duplicate", {
      update_id: extracted.updateId,
      previous_status: claim.existingStatus,
    });
    return {
      outcome: "duplicate",
      status: claim.existingStatus,
      offerId: null,
      realtimeEvent: null,
      reason: "already_processed",
      offerStatus: null,
    };
  }

  // --- 3. Parse (R4) -------------------------------------------------------
  const parseInput: ParseInput = {
    text: extracted.text,
    caption: extracted.caption,
    telegram_message_id: extracted.messageId,
    telegram_update_id: extracted.updateId,
    date: extracted.date,
  };
  const parsed = parseOffer(parseInput, deps.linkPort);
  if (!parsed.ok) {
    await deps.persistence.finalizeUpdate(extracted.updateId, "rejected", parsed.reason);
    deps.logger?.info("telegram.offer.rejected", {
      update_id: extracted.updateId,
      reason: parsed.reason,
    });
    return {
      outcome: "rejected",
      status: "rejected",
      offerId: null,
      realtimeEvent: null,
      reason: parsed.reason,
      offerStatus: null,
    };
  }

  const offer = parsed.offer;
  // An allowed-merchant link is mandatory: `offers.platform` is NOT NULL and an
  // offer cannot be published without an affiliate URL (R4.5, R6.8).
  if (offer.platform === null || offer.affiliate_url === null || offer.merchant === null) {
    await deps.persistence.finalizeUpdate(extracted.updateId, "rejected", "no_allowed_merchant");
    deps.logger?.info("telegram.offer.rejected", {
      update_id: extracted.updateId,
      reason: "no_allowed_merchant",
    });
    return {
      outcome: "rejected",
      status: "rejected",
      offerId: null,
      realtimeEvent: null,
      reason: "no_allowed_merchant",
      offerStatus: null,
    };
  }

  // --- 4. Identity + duplicate resolution (R7.1, R7.2) ---------------------
  const fingerprint = computeFingerprint({
    platform: offer.platform,
    externalProductId: offer.external_product_id,
    title: offer.title,
    destinationUrl: offer.affiliate_url,
  });
  const identity: OfferIdentity = {
    platform: offer.platform,
    externalProductId: offer.external_product_id,
    telegramChatId: extracted.chatId,
    telegramMessageId: extracted.messageId,
    fingerprint,
  };
  const candidates = await deps.persistence.findCandidates(identity);
  const decision = resolveDuplicate(identity, candidates, {
    authorizedChatId: deps.authorizedChatId,
  });

  const offerStatus: OfferStatus = offer.needs_review ? "needs_review" : "active";

  // --- 5a. Update path (R7.3, R7.5, R7.6) ----------------------------------
  if (decision.action === "update") {
    const patch: OfferPatch = {
      current_price: offer.current_price.toNumber(),
      original_price: offer.original_price === null ? null : offer.original_price.toNumber(),
      discount_percent: offer.discount_percent,
      needs_review: offer.needs_review,
      last_verified_at: nowIso,
      updated_at: nowIso,
    };
    await deps.persistence.updateOffer(decision.matchedId, patch);

    if (extracted.isEdit) {
      await writeEditAudit(deps, extracted, decision.matchedId, offer.title);
    }

    await deps.persistence.finalizeUpdate(extracted.updateId, "processed", null);
    deps.logger?.info("telegram.offer.updated", {
      update_id: extracted.updateId,
      offer_id: decision.matchedId,
      matched_by: decision.matchedBy,
    });
    return {
      outcome: "updated",
      status: "processed",
      offerId: decision.matchedId,
      realtimeEvent: "UPDATE",
      reason: null,
      offerStatus,
    };
  }

  // --- 5b. Insert path (image within budget, then persist) -----------------
  let imageUrl: string = fallbackImageUrl;
  let imageStoragePath: string | null = null;
  let imageStatus: "ready" | "pending" | "failed" = "ready";

  if (extracted.photo.length > 0) {
    const image = await deps.imageProcessor(extracted.photo);
    if (image.imageStatus === "ready") {
      imageUrl = image.imageUrl;
      imageStoragePath = image.imageStoragePath;
      imageStatus = "ready";
    } else {
      // Slow/failed image: save the offer with the fallback and flag for retry
      // by the Cron rather than failing the whole ingest (R3.8).
      imageUrl = image.imageUrl;
      imageStoragePath = null;
      imageStatus = "pending";
      deps.logger?.info("telegram.image.fallback", {
        update_id: extracted.updateId,
        reason: image.reason,
      });
    }
  }

  const slug = generateSlug(offer.title, {
    platform: offer.platform,
    externalProductId: offer.external_product_id,
    fingerprint,
  });

  const insert: OfferInsert = {
    platform: offer.platform,
    merchant: offer.merchant,
    external_product_id: offer.external_product_id,
    fingerprint,
    telegram_chat_id: extracted.chatId,
    telegram_message_id: extracted.messageId,
    telegram_update_id: extracted.updateId,
    title: offer.title,
    slug,
    image_url: imageUrl,
    image_storage_path: imageStoragePath,
    image_status: imageStatus,
    original_price: offer.original_price === null ? null : offer.original_price.toNumber(),
    current_price: offer.current_price.toNumber(),
    discount_percent: offer.discount_percent,
    currency: "MXN",
    affiliate_url: offer.affiliate_url,
    affiliate_tag: offer.affiliate_tag,
    status: offerStatus,
    needs_review: offer.needs_review,
    raw_text: offer.raw_text,
    published_at: offer.published_at,
  };
  const { id } = await deps.persistence.insertOffer(insert);

  if (extracted.isEdit) {
    await writeEditAudit(deps, extracted, id, offer.title);
  }

  await deps.persistence.finalizeUpdate(extracted.updateId, "processed", null);
  deps.logger?.info("telegram.offer.inserted", {
    update_id: extracted.updateId,
    offer_id: id,
    status: offerStatus,
    image_status: imageStatus,
  });
  return {
    outcome: "inserted",
    status: "processed",
    offerId: id,
    realtimeEvent: "INSERT",
    reason: null,
    offerStatus,
  };
}

/** Writes the `edited_message` audit entry (R7.7); details carry no secrets. */
async function writeEditAudit(
  deps: IngestDeps,
  extracted: ExtractedUpdate,
  offerId: string,
  title: string,
): Promise<void> {
  const details: Json = {
    source: "telegram_edit",
    update_id: extracted.updateId,
    message_id: extracted.messageId,
    update_type: extracted.kind,
    edit_date: extracted.editDate,
    title,
  };
  await deps.persistence.insertAuditLog({
    action: "edit",
    offer_id: offerId,
    actor_email: null,
    details,
  });
}
