/**
 * Dry-run analysis for the admin "Probar mensaje" panel (Task 35 / R23.6).
 *
 * Pure logic, **no I/O and no `server-only`**: it runs the *exact same* parsing
 * pipeline the webhook uses — {@link parseOffer} with the SSRF-backed
 * {@link createLinkPort}, the same fingerprint/slug/category derivations — but
 * **never** persists anything. There is deliberately no Supabase import here, so
 * it is structurally impossible for this module to write to the database; the
 * panel is a preview only.
 *
 * Because it is pure, the whole analysis is unit-testable without mocks, and it
 * shares the production functions (not copies) so the preview cannot drift from
 * what the webhook would actually do. The thin Server Action in
 * `app/(admin)/admin/probar/actions.ts` only adds the admin-session re-check and
 * reads `AMAZON_TRACKING_ID` before delegating here.
 *
 * Parity with the webhook (`lib/telegram/ingest.ts`):
 *  - the parser is run identically (text + caption, injected link port);
 *  - a price rejection maps to a `rejected` analysis with the same reason;
 *  - the post-parse "allowed-merchant required" rule the webhook enforces
 *    (`offers.platform`/`affiliate_url` are NOT NULL) is surfaced as the
 *    `no_allowed_merchant` outcome, so the admin sees the offer would be
 *    rejected even though the parser succeeded;
 *  - the resulting status is `needs_review ? "needs_review" : "active"`, exactly
 *    as the ingest pipeline computes it.
 */

import { computeFingerprint } from "@/lib/dedup/fingerprint";
import { generateSlug } from "@/lib/dedup/slug";
import { classifyCategory, type Category } from "@/lib/parser/category";
import { normalizeText } from "@/lib/parser/normalize";
import {
  parseOffer,
  reconcileDiscount,
  type ParsedOffer,
  type ParseInput,
  type Platform,
  type PriceRejection,
} from "@/lib/parser/parse";
import type { PublicOffer } from "@/lib/offers/query";
import { createLinkPort } from "@/lib/ssrf";

/** What the admin pasted: the message text and/or a photo caption. */
export interface TestMessageInput {
  text: string;
  caption: string;
}

/** Configuration injected by the Server Action (never read from env here). */
export interface TestMessageConfig {
  /** Expected Amazon affiliate tag (`AMAZON_TRACKING_ID`). */
  trackingId: string;
  /** Optional SSRF allowlist override; defaults to the production allowlist. */
  allowlist?: readonly string[];
}

/** Parser-detected fields, fully serializable (prices as numbers, not Decimal). */
export interface DetectedFields {
  title: string;
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  platform: Platform | null;
  merchant: string | null;
  externalProductId: string | null;
  affiliateUrl: string | null;
  affiliateTag: string | null;
  publishedAt: string | null;
}

/** A single review signal explaining why the offer would be flagged. */
export interface TestMessageWarning {
  code: "discount_drift" | "tag_mismatch";
  message: string;
}

/** Identity values the ingest pipeline would derive for this offer. */
export interface DerivedIdentity {
  fingerprint: string;
  slug: string;
  category: Category;
}

/** The status the webhook would assign (or `rejected` when it would not store it). */
export type ResultingStatus = "active" | "needs_review" | "rejected";

/** What the webhook would do with this message, mirroring `ingestUpdate`. */
export interface TestMessageOutcome {
  /** `true` when an offer would be created (an allowed-merchant link exists). */
  wouldCreateOffer: boolean;
  resultingStatus: ResultingStatus;
  /** Technical, non-secret reason when the offer would be rejected. */
  rejectionReason: "no_allowed_merchant" | null;
}

/** Result of analyzing a pasted message. Always serializable. */
export type TestMessageAnalysis =
  | { status: "empty" }
  | { status: "rejected"; reason: PriceRejection; message: string }
  | {
      status: "parsed";
      fields: DetectedFields;
      derived: DerivedIdentity;
      needsReview: boolean;
      warnings: TestMessageWarning[];
      outcome: TestMessageOutcome;
      /** A ready-to-render preview offer, or `null` with no allowed-merchant link. */
      preview: PublicOffer | null;
    };

/** Human-readable Spanish copy for each price rejection reason (R4.10, R4.11). */
const REJECTION_MESSAGE: Record<PriceRejection, string> = {
  missing_price: "No se detectó un precio en el mensaje.",
  negative_price: "El precio detectado es negativo.",
  absurd_price: "El precio detectado está fuera de un rango razonable.",
  current_ge_original: "El precio actual no es menor que el precio original.",
};

/** Re-extract the written percentage exactly as the parser does (for drift). */
function extractWrittenPercent(text: string): number | null {
  const match = normalizeText(text).match(/(\d{1,3})\s*%/);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Build the warnings list, decomposing the parser's combined `needs_review`
 * flag into its two underlying causes. Both are recomputed from the *exact*
 * production functions/values so the breakdown stays faithful:
 *  - **discount drift** via {@link reconcileDiscount} (the very function the
 *    parser used internally) on the detected prices + written percent;
 *  - **tag mismatch** by comparing the preserved `affiliate_tag` against the
 *    expected tracking id, mirroring the link port's Amazon rule (R5.7, R5.8).
 *
 * Their OR equals `offer.needs_review`, so the panel's summary flag and the
 * itemized reasons always agree.
 */
function buildWarnings(
  offer: ParsedOffer,
  combinedText: string,
  trackingId: string,
): TestMessageWarning[] {
  const warnings: TestMessageWarning[] = [];

  const writtenPercent = extractWrittenPercent(combinedText);
  const discountDrift = reconcileDiscount(
    offer.original_price,
    offer.current_price,
    writtenPercent,
  ).needsReview;
  if (discountDrift) {
    const detail =
      writtenPercent !== null && offer.discount_percent !== null
        ? ` (escrito ${writtenPercent}%, calculado ${offer.discount_percent}%)`
        : "";
    warnings.push({
      code: "discount_drift",
      message: `El descuento escrito no coincide con el calculado${detail}.`,
    });
  }

  const tagMismatch =
    offer.platform === "amazon" &&
    offer.affiliate_tag !== null &&
    offer.affiliate_tag !== trackingId;
  if (tagMismatch) {
    warnings.push({
      code: "tag_mismatch",
      message: `El tag de afiliado (${offer.affiliate_tag}) no coincide con el esperado (${trackingId}).`,
    });
  }

  return warnings;
}

/**
 * Build the preview {@link PublicOffer} for the {@link OfferCard}. Only called
 * when an allowed-merchant link exists, so `platform`, `merchant` and
 * `affiliateUrl` are present. Synthetic `id`/timestamps are inert: the card uses
 * them only for a (preview-only) link and relative-time labels, and there is no
 * image in a dry run, so `image_status` is left non-ready to show the graceful
 * placeholder.
 */
function buildPreview(
  offer: ParsedOffer,
  platform: Platform,
  status: ResultingStatus,
  category: Category,
): PublicOffer {
  const previewStatus = status === "rejected" ? "needs_review" : status;
  const timestamp = offer.published_at ?? "";
  return {
    id: "preview",
    platform,
    merchant: offer.merchant ?? "",
    external_product_id: offer.external_product_id,
    title: offer.title,
    slug: "preview",
    short_description: null,
    editorial_summary: null,
    image_url: null,
    image_alt: offer.title,
    image_status: "pending",
    original_price: offer.original_price === null ? null : offer.original_price.toNumber(),
    current_price: offer.current_price.toNumber(),
    discount_percent: offer.discount_percent,
    currency: "MXN",
    affiliate_url: offer.affiliate_url,
    category_id: null,
    status: previewStatus,
    is_featured: false,
    published_at: offer.published_at,
    updated_at: timestamp,
    last_verified_at: null,
    expires_at: null,
    created_at: timestamp,
  };
}

/**
 * Analyze a pasted Telegram message with the production parsing pipeline,
 * **without persisting anything** (R23.6). Returns a serializable, discriminated
 * result the panel renders directly.
 */
export function analyzeTestMessage(
  input: TestMessageInput,
  config: TestMessageConfig,
): TestMessageAnalysis {
  const text = input.text.trim();
  const caption = input.caption.trim();
  if (text === "" && caption === "") {
    return { status: "empty" };
  }

  const parseInput: ParseInput = {
    text: text === "" ? null : text,
    caption: caption === "" ? null : caption,
  };

  // Same link port the webhook injects (R23.6 parity).
  const linkPort = createLinkPort({
    trackingId: config.trackingId,
    allowlist: config.allowlist,
  });
  const parsed = parseOffer(parseInput, linkPort);

  if (!parsed.ok) {
    return {
      status: "rejected",
      reason: parsed.reason,
      message: REJECTION_MESSAGE[parsed.reason],
    };
  }

  const offer = parsed.offer;
  const combinedText = [parseInput.text, parseInput.caption]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");

  // Identity the ingest pipeline would derive (R7.2, R6.4, R4.14).
  const fingerprint = computeFingerprint({
    platform: offer.platform,
    externalProductId: offer.external_product_id,
    title: offer.title,
    destinationUrl: offer.affiliate_url,
  });
  const slug = generateSlug(offer.title, {
    platform: offer.platform,
    externalProductId: offer.external_product_id,
    fingerprint,
  });
  const category = classifyCategory(offer.title);

  // Post-parse merchant gate, exactly as the webhook enforces it.
  const hasMerchant =
    offer.platform !== null && offer.affiliate_url !== null && offer.merchant !== null;
  const resultingStatus: ResultingStatus = !hasMerchant
    ? "rejected"
    : offer.needs_review
      ? "needs_review"
      : "active";
  const outcome: TestMessageOutcome = {
    wouldCreateOffer: hasMerchant,
    resultingStatus,
    rejectionReason: hasMerchant ? null : "no_allowed_merchant",
  };

  const warnings = buildWarnings(offer, combinedText, config.trackingId);

  const preview =
    hasMerchant && offer.platform !== null
      ? buildPreview(offer, offer.platform, resultingStatus, category)
      : null;

  return {
    status: "parsed",
    fields: {
      title: offer.title,
      currentPrice: offer.current_price.toNumber(),
      originalPrice: offer.original_price === null ? null : offer.original_price.toNumber(),
      discountPercent: offer.discount_percent,
      platform: offer.platform,
      merchant: offer.merchant,
      externalProductId: offer.external_product_id,
      affiliateUrl: offer.affiliate_url,
      affiliateTag: offer.affiliate_tag,
      publishedAt: offer.published_at,
    },
    derived: { fingerprint, slug, category },
    needsReview: offer.needs_review,
    warnings,
    outcome,
    preview,
  };
}
