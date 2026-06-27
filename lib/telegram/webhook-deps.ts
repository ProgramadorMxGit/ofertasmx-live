import "server-only";

import { createLinkPort } from "@/lib/ssrf";
import { serverEnv } from "@/lib/env.server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { CandidateIdentity, OfferIdentity } from "@/lib/dedup/dedup";
import type { Platform } from "@/lib/parser/parse";
import { createProductionImageDeps } from "@/lib/telegram/adapters";
import { processOfferImage } from "@/lib/telegram/images";
import { createSafeLogger, type SafeLogger } from "@/lib/telegram/secret";
import {
  type ClaimResult,
  type ClaimUpdateInput,
  type IngestDeps,
  type OfferInsert,
  type OfferPatch,
  type PersistencePort,
  type ProcessingStatus,
  type AuditLogEntry,
} from "@/lib/telegram/ingest";

/**
 * Production wiring for the webhook (`server-only`).
 *
 * This is the single place the injected ports of {@link ingestUpdate} become
 * real I/O: the service-role Supabase client (persistence), `createLinkPort`
 * with the configured `AMAZON_TRACKING_ID` (SSRF-backed link detection),
 * `processOfferImage` bound to `sharp` + Storage (image), the system clock and
 * the authorized chat id from `serverEnv`. Pure modules stay testable with
 * mocks; only this file touches secrets and the network (R8.5, R8.7, R1.16).
 */

const OFFER_CANDIDATE_COLUMNS =
  "id, platform, external_product_id, telegram_chat_id, telegram_message_id, fingerprint";

/** Minimal shape of a PostgREST error we branch on (unique-violation code). */
interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

function asPostgrestError(error: unknown): PostgrestErrorLike | null {
  if (error !== null && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    };
  }
  return null;
}

const UNIQUE_VIOLATION = "23505";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

interface CandidateRow {
  id: string;
  platform: Platform;
  external_product_id: string | null;
  telegram_chat_id: number;
  telegram_message_id: number;
  fingerprint: string;
}

function toCandidate(row: CandidateRow): CandidateIdentity {
  return {
    id: row.id,
    platform: row.platform,
    externalProductId: row.external_product_id,
    telegramChatId: row.telegram_chat_id,
    telegramMessageId: row.telegram_message_id,
    fingerprint: row.fingerprint,
  };
}

/**
 * Builds the service-role-backed {@link PersistencePort}. `claimUpdate`
 * implements `INSERT ... ON CONFLICT(update_id) DO NOTHING` semantics by
 * attempting the insert and, on a unique violation, reading back the existing
 * status (R1.12). All other errors propagate so the route can answer 5xx and
 * Telegram retries safely (R1.15).
 */
export function createSupabasePersistence(client: ServiceClient): PersistencePort {
  return {
    async claimUpdate(input: ClaimUpdateInput): Promise<ClaimResult> {
      const { error } = await client.from("telegram_updates").insert({
        update_id: input.updateId,
        message_id: input.messageId,
        chat_id: input.chatId,
        update_type: input.updateType,
        payload: input.payload ?? null,
        processing_status: "received",
      });
      if (error === null) {
        return { inserted: true, existingStatus: null };
      }
      const pgError = asPostgrestError(error);
      if (pgError?.code !== UNIQUE_VIOLATION) {
        throw error;
      }
      const existing = await client
        .from("telegram_updates")
        .select("processing_status")
        .eq("update_id", input.updateId)
        .single();
      if (existing.error !== null) {
        throw existing.error;
      }
      return {
        inserted: false,
        existingStatus: (existing.data.processing_status as ProcessingStatus) ?? null,
      };
    },

    async finalizeUpdate(
      updateId: number,
      status: ProcessingStatus,
      errorMessage: string | null,
    ): Promise<void> {
      const { error } = await client
        .from("telegram_updates")
        .update({
          processing_status: status,
          error_message: errorMessage,
          processed_at: new Date().toISOString(),
        })
        .eq("update_id", updateId);
      if (error !== null) {
        throw error;
      }
    },

    async findCandidates(identity: OfferIdentity): Promise<CandidateIdentity[]> {
      const found = new Map<string, CandidateIdentity>();
      const collect = (rows: CandidateRow[] | null): void => {
        for (const row of rows ?? []) found.set(row.id, toCandidate(row));
      };

      const byFingerprint = await client
        .from("offers")
        .select(OFFER_CANDIDATE_COLUMNS)
        .eq("fingerprint", identity.fingerprint)
        .limit(20);
      if (byFingerprint.error !== null) throw byFingerprint.error;
      collect(byFingerprint.data as CandidateRow[] | null);

      if (identity.externalProductId !== null) {
        const byExternalId = await client
          .from("offers")
          .select(OFFER_CANDIDATE_COLUMNS)
          .eq("external_product_id", identity.externalProductId)
          .limit(20);
        if (byExternalId.error !== null) throw byExternalId.error;
        collect(byExternalId.data as CandidateRow[] | null);
      }

      if (identity.telegramMessageId !== null && identity.telegramChatId !== null) {
        const byMessage = await client
          .from("offers")
          .select(OFFER_CANDIDATE_COLUMNS)
          .eq("telegram_chat_id", identity.telegramChatId)
          .eq("telegram_message_id", identity.telegramMessageId)
          .limit(5);
        if (byMessage.error !== null) throw byMessage.error;
        collect(byMessage.data as CandidateRow[] | null);
      }

      return [...found.values()];
    },

    async insertOffer(offer: OfferInsert): Promise<{ id: string }> {
      const { data, error } = await client
        .from("offers")
        .insert({
          platform: offer.platform,
          merchant: offer.merchant,
          external_product_id: offer.external_product_id,
          fingerprint: offer.fingerprint,
          telegram_chat_id: offer.telegram_chat_id,
          telegram_message_id: offer.telegram_message_id,
          telegram_update_id: offer.telegram_update_id,
          title: offer.title,
          slug: offer.slug,
          image_url: offer.image_url,
          image_storage_path: offer.image_storage_path,
          image_status: offer.image_status,
          original_price: offer.original_price,
          current_price: offer.current_price,
          discount_percent: offer.discount_percent,
          currency: offer.currency,
          affiliate_url: offer.affiliate_url,
          affiliate_tag: offer.affiliate_tag,
          status: offer.status,
          needs_review: offer.needs_review,
          raw_text: offer.raw_text,
          published_at: offer.published_at,
        })
        .select("id")
        .single();
      if (error !== null) {
        throw error;
      }
      return { id: data.id };
    },

    async updateOffer(id: string, patch: OfferPatch): Promise<void> {
      const { error } = await client
        .from("offers")
        .update({
          current_price: patch.current_price,
          original_price: patch.original_price,
          discount_percent: patch.discount_percent,
          needs_review: patch.needs_review,
          last_verified_at: patch.last_verified_at,
          updated_at: patch.updated_at,
        })
        .eq("id", id);
      if (error !== null) {
        throw error;
      }
    },

    async insertAuditLog(entry: AuditLogEntry): Promise<void> {
      const { error } = await client.from("admin_audit_logs").insert({
        action: entry.action,
        offer_id: entry.offer_id,
        actor_email: entry.actor_email,
        details: entry.details,
      });
      if (error !== null) {
        throw error;
      }
    },
  };
}

/** A secret-safe logger seeded with the three protected secret values (R1.16). */
export function createWebhookLogger(): SafeLogger {
  return createSafeLogger({
    secretValues: [
      serverEnv.TELEGRAM_BOT_TOKEN,
      serverEnv.TELEGRAM_WEBHOOK_SECRET,
      serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    ],
  });
}

/** Assembles the production {@link IngestDeps} consumed by the route handler. */
export function createProductionIngestDeps(): IngestDeps {
  const client = createServiceRoleClient();
  const imageDeps = createProductionImageDeps();
  return {
    persistence: createSupabasePersistence(client),
    linkPort: createLinkPort({ trackingId: serverEnv.AMAZON_TRACKING_ID }),
    imageProcessor: (photos) => processOfferImage(photos, imageDeps),
    clock: () => new Date(),
    authorizedChatId: serverEnv.TELEGRAM_ALLOWED_CHAT_ID,
    logger: createWebhookLogger(),
  };
}
