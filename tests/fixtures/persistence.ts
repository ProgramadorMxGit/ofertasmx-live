/**
 * In-memory {@link PersistencePort} for webhook tests (no live database).
 *
 * It enforces the same invariants the SQL schema does, so the tests exercise the
 * real idempotency/dedup behaviour:
 *  - `telegram_updates` keyed by `update_id` with `ON CONFLICT DO NOTHING`
 *    semantics (R1.12);
 *  - `offers` unique on `(telegram_chat_id, telegram_message_id)` (R6.6) and on
 *    `slug` (R6.4) — inserting a duplicate throws, mimicking a Postgres unique
 *    violation.
 *
 * State (`offers`, `updates`, `auditLogs`, `calls`) is exposed for assertions.
 */

import type { CandidateIdentity, OfferIdentity } from "@/lib/dedup/dedup";
import type {
  AuditLogEntry,
  ClaimResult,
  ClaimUpdateInput,
  OfferInsert,
  OfferPatch,
  PersistencePort,
  ProcessingStatus,
} from "@/lib/telegram/ingest";
import type { Json } from "@/lib/supabase/types";

/** A persisted `telegram_updates` row. */
export interface StoredUpdate {
  update_id: number;
  message_id: number | null;
  chat_id: number | null;
  update_type: string | null;
  /** The raw validated update stored on claim (R6.9); `null` when none was provided. */
  payload: Json | null;
  processing_status: ProcessingStatus;
  error_message: string | null;
}

/** A persisted `offers` row (the insert plus mutable patch fields). */
export type StoredOffer = OfferInsert & {
  id: string;
  last_verified_at: string | null;
  updated_at: string | null;
};

/** Call counters for assertions about effects. */
export interface PersistenceCalls {
  claim: number;
  finalize: number;
  insert: number;
  update: number;
  audit: number;
}

/** The in-memory persistence: the port plus its inspectable state. */
export interface InMemoryPersistence {
  port: PersistencePort;
  offers: StoredOffer[];
  updates: Map<number, StoredUpdate>;
  auditLogs: AuditLogEntry[];
  calls: PersistenceCalls;
}

function toCandidate(offer: StoredOffer): CandidateIdentity {
  return {
    id: offer.id,
    platform: offer.platform,
    externalProductId: offer.external_product_id,
    telegramChatId: offer.telegram_chat_id,
    telegramMessageId: offer.telegram_message_id,
    fingerprint: offer.fingerprint,
  };
}

/** Creates a fresh in-memory persistence with empty state. */
export function createInMemoryPersistence(): InMemoryPersistence {
  const offers: StoredOffer[] = [];
  const updates = new Map<number, StoredUpdate>();
  const auditLogs: AuditLogEntry[] = [];
  const calls: PersistenceCalls = { claim: 0, finalize: 0, insert: 0, update: 0, audit: 0 };
  let idCounter = 0;

  const port: PersistencePort = {
    async claimUpdate(input: ClaimUpdateInput): Promise<ClaimResult> {
      calls.claim += 1;
      const existing = updates.get(input.updateId);
      if (existing !== undefined) {
        return { inserted: false, existingStatus: existing.processing_status };
      }
      updates.set(input.updateId, {
        update_id: input.updateId,
        message_id: input.messageId,
        chat_id: input.chatId,
        update_type: input.updateType,
        payload: input.payload ?? null,
        processing_status: "received",
        error_message: null,
      });
      return { inserted: true, existingStatus: null };
    },

    async finalizeUpdate(
      updateId: number,
      status: ProcessingStatus,
      errorMessage: string | null,
    ): Promise<void> {
      calls.finalize += 1;
      const existing = updates.get(updateId);
      if (existing !== undefined) {
        existing.processing_status = status;
        existing.error_message = errorMessage;
      } else {
        updates.set(updateId, {
          update_id: updateId,
          message_id: null,
          chat_id: null,
          update_type: null,
          payload: null,
          processing_status: status,
          error_message: errorMessage,
        });
      }
    },

    async findCandidates(_identity: OfferIdentity): Promise<CandidateIdentity[]> {
      // Return all offers; resolveDuplicate filters by the priority keys. This is
      // faithful: the engine, not the store, owns match selection (R7.1).
      return offers.map(toCandidate);
    },

    async insertOffer(offer: OfferInsert): Promise<{ id: string }> {
      calls.insert += 1;
      const messageClash = offers.find(
        (existing) =>
          existing.telegram_chat_id === offer.telegram_chat_id &&
          existing.telegram_message_id === offer.telegram_message_id,
      );
      if (messageClash !== undefined) {
        throw new Error("unique violation (telegram_chat_id, telegram_message_id)");
      }
      if (offers.some((existing) => existing.slug === offer.slug)) {
        throw new Error("unique violation (slug)");
      }
      idCounter += 1;
      const id = `offer-${idCounter}`;
      offers.push({ ...offer, id, last_verified_at: null, updated_at: null });
      return { id };
    },

    async updateOffer(id: string, patch: OfferPatch): Promise<void> {
      calls.update += 1;
      const offer = offers.find((existing) => existing.id === id);
      if (offer === undefined) {
        throw new Error(`offer not found: ${id}`);
      }
      offer.current_price = patch.current_price;
      offer.original_price = patch.original_price;
      offer.discount_percent = patch.discount_percent;
      offer.needs_review = patch.needs_review;
      offer.last_verified_at = patch.last_verified_at;
      offer.updated_at = patch.updated_at;
    },

    async insertAuditLog(entry: AuditLogEntry): Promise<void> {
      calls.audit += 1;
      auditLogs.push(entry);
    },
  };

  return { port, offers, updates, auditLogs, calls };
}
