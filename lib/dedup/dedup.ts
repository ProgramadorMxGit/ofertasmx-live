/**
 * Deduplication engine (R7.1, R7.3, R7.4, R7.5).
 *
 * {@link resolveDuplicate} is a **pure** decision function (no DB I/O): given an
 * incoming offer identity and the set of existing candidate identities, it
 * decides whether to insert a brand-new offer or update an existing one, and —
 * when updating — which candidate matched and by which key.
 *
 * Matches are resolved **in priority order** (R7.1): the first key for which the
 * incoming offer shares a value with some candidate wins. From strongest to
 * weakest:
 *
 *   1. `platform_external_id` — same platform AND same external id.
 *   2. `asin`                 — same Amazon ASIN (`[A-Z0-9]{10}`).
 *   3. `mlm`                  — same Mercado Libre id (`MLM\d+`).
 *   4. `telegram_message_id`  — same message id, within the authorized chat.
 *   5. `fingerprint`          — same normalized product fingerprint.
 *
 * The ASIN/MLM keys are derived from the external id's *shape*, not the platform
 * field, so they still catch a product whose platform was recorded differently
 * (e.g. resolved from a short link) — that is what makes them distinct from the
 * stricter priority-1 key.
 *
 * On a match the decision is an **update** that carries the realtime event
 * (`"UPDATE"`, never a new `"INSERT"`, R7.5) plus the field policy: the price,
 * discount and date fields are patched while the `slug` and image are preserved
 * (R7.3, R7.6). The DB write itself is performed by the webhook (Task 14); this
 * module only computes the decision.
 */

import type { Platform } from "@/lib/parser/parse";

/** The Telegram Chat Autorizado (`chat.id`) whose messages produce offers (R1.10). */
export const AUTHORIZED_CHAT_ID = 5054325626;

/** The identity key by which an incoming offer matched an existing candidate. */
export type MatchKey =
  | "platform_external_id"
  | "asin"
  | "mlm"
  | "telegram_message_id"
  | "fingerprint";

/** The identity of an offer, as seen by the deduplication engine. */
export interface OfferIdentity {
  platform: Platform | null;
  externalProductId: string | null;
  telegramChatId: number | null;
  telegramMessageId: number | null;
  fingerprint: string;
}

/** An existing offer that an incoming offer may match against. */
export interface CandidateIdentity extends OfferIdentity {
  /** Stable id of the existing offer (returned as `matchedId`). */
  id: string;
}

/**
 * Fields an update is allowed to patch from the incoming offer (R7.3): the price
 * pair, the discount and the freshness timestamps.
 */
export const DUPLICATE_PATCH_FIELDS = [
  "current_price",
  "original_price",
  "discount_percent",
  "last_verified_at",
  "updated_at",
] as const;
export type DuplicatePatchField = (typeof DUPLICATE_PATCH_FIELDS)[number];

/**
 * Fields an update must preserve from the existing offer (R7.6): the published
 * slug and the already-processed image are never overwritten on a re-publish.
 */
export const DUPLICATE_PRESERVE_FIELDS = [
  "slug",
  "image_url",
  "image_storage_path",
  "image_alt",
] as const;
export type DuplicatePreserveField = (typeof DUPLICATE_PRESERVE_FIELDS)[number];

/**
 * The deduplication decision. An `insert` creates a new offer and emits an
 * `INSERT` realtime event; an `update` patches the matched offer in place and
 * emits an `UPDATE` event (R7.5), patching {@link DUPLICATE_PATCH_FIELDS} while
 * preserving {@link DUPLICATE_PRESERVE_FIELDS}.
 */
export type DedupDecision =
  | { action: "insert"; realtimeEvent: "INSERT" }
  | {
      action: "update";
      matchedId: string;
      matchedBy: MatchKey;
      realtimeEvent: "UPDATE";
      patch: readonly DuplicatePatchField[];
      preserve: readonly DuplicatePreserveField[];
    };

/** Options for {@link resolveDuplicate}. */
export interface ResolveDuplicateOptions {
  /** The authorized chat id used to scope `telegram_message_id` matching. */
  authorizedChatId?: number;
}

const ASIN_RE = /^[A-Z0-9]{10}$/;
const MLM_RE = /^MLM\d+$/;

/** Priority-1 key: platform and external id must both be present and equal. */
function platformExternalIdKey(id: OfferIdentity): string | null {
  if (id.platform === null || id.externalProductId === null) return null;
  return `${id.platform}\u0000${id.externalProductId}`;
}

/** Priority-2 key: an ASIN-shaped external id, regardless of the platform field. */
function asinKey(id: OfferIdentity): string | null {
  return id.externalProductId !== null && ASIN_RE.test(id.externalProductId)
    ? id.externalProductId
    : null;
}

/** Priority-3 key: an MLM-shaped external id, regardless of the platform field. */
function mlmKey(id: OfferIdentity): string | null {
  return id.externalProductId !== null && MLM_RE.test(id.externalProductId)
    ? id.externalProductId
    : null;
}

/** Priority-4 key: the message id, only within the authorized chat (R7.1). */
function telegramMessageKey(id: OfferIdentity, authorizedChatId: number): string | null {
  return id.telegramChatId === authorizedChatId && id.telegramMessageId !== null
    ? String(id.telegramMessageId)
    : null;
}

/** Priority-5 key: the normalized product fingerprint (R7.2). */
function fingerprintKey(id: OfferIdentity): string | null {
  return id.fingerprint !== "" ? id.fingerprint : null;
}

const INSERT_DECISION: DedupDecision = { action: "insert", realtimeEvent: "INSERT" };

/**
 * Resolves whether an incoming offer is a duplicate of an existing candidate,
 * applying the priority order in {@link MatchKey}. Returns an `update` decision
 * referencing the first candidate that shares the highest-priority key, or an
 * `insert` decision when no key matches any candidate.
 */
export function resolveDuplicate(
  incoming: OfferIdentity,
  candidates: readonly CandidateIdentity[],
  options: ResolveDuplicateOptions = {},
): DedupDecision {
  const authorizedChatId = options.authorizedChatId ?? AUTHORIZED_CHAT_ID;

  const extractors: ReadonlyArray<{
    key: MatchKey;
    of: (id: OfferIdentity) => string | null;
  }> = [
    { key: "platform_external_id", of: platformExternalIdKey },
    { key: "asin", of: asinKey },
    { key: "mlm", of: mlmKey },
    { key: "telegram_message_id", of: (id) => telegramMessageKey(id, authorizedChatId) },
    { key: "fingerprint", of: fingerprintKey },
  ];

  for (const { key, of } of extractors) {
    const incomingValue = of(incoming);
    if (incomingValue === null) continue;

    const match = candidates.find((candidate) => of(candidate) === incomingValue);
    if (match !== undefined) {
      return {
        action: "update",
        matchedId: match.id,
        matchedBy: key,
        realtimeEvent: "UPDATE",
        patch: DUPLICATE_PATCH_FIELDS,
        preserve: DUPLICATE_PRESERVE_FIELDS,
      };
    }
  }

  return INSERT_DECISION;
}
