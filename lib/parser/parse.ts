/**
 * Message Parser — field, price and discount extraction (R4.4–R4.13).
 *
 * Pure logic (no I/O) that turns a Telegram message (`text` and/or `caption`,
 * including edited messages and multi-line titles, R4.3) into a structured
 * offer. It tolerates formatting noise (case, extra spaces, thousands
 * separators, with/without cents, `$`/`MXN`, emojis, blank lines, short/long
 * URLs and UTM params, R4.2), recomputes the discount with exact decimal
 * arithmetic, reconciles it against the written percent within ±1pp, rejects
 * impossible prices, and never invents a field that is absent from the message.
 *
 * Link validation (allowed-merchant detection, SSRF protections, short-link
 * resolution, ASIN/MLM extraction and affiliate-tag verification) is the job of
 * `lib/ssrf`. To avoid a forward dependency, the parser depends only on the
 * small {@link LinkPort} interface defined here and accepts it by injection.
 * The SSRF-backed port is built with `createLinkPort({ allowlist, trackingId })`
 * from `@/lib/ssrf` and passed to {@link parseOffer} by the webhook (Task 14):
 *
 *     import { createLinkPort } from "@/lib/ssrf";
 *     const result = parseOffer(input, createLinkPort({ trackingId }));
 *
 * The minimal in-module {@link defaultLinkPort} stays as a zero-config fallback
 * so the parser is self-contained and its tests need no I/O.
 */

import {
  Decimal,
  discountPercent as computeDiscountPercent,
  toMoney,
} from "@/lib/utils/money";
import { normalizeText } from "@/lib/parser/normalize";

/** Supported affiliate platforms. */
export type Platform = "amazon" | "mercado_libre";

/**
 * Result of resolving a candidate URL against the allowed merchants.
 * Produced by a {@link LinkPort}. Carries no secrets.
 */
export interface LinkInfo {
  /** The affiliate URL to store, preserved exactly as written (R5.6). */
  url: string;
  platform: Platform;
  merchant: string;
  /** ASIN / MLM when extractable from the URL, otherwise `null`. */
  externalProductId: string | null;
  /** Amazon `tag` parameter observed in the URL, otherwise `null`. */
  affiliateTag: string | null;
  /** `true` when the link itself warrants review (e.g. tag mismatch, R5.8). */
  needsReview: boolean;
}

/**
 * Injectable port for link validation/identification (wired in Task 5).
 *
 * Implementations MUST perform no network I/O in {@link detect}; they classify
 * a single candidate URL and return {@link LinkInfo} when it belongs to an
 * allowed merchant, or `null` when it must be ignored/rejected.
 */
export interface LinkPort {
  detect(url: string): LinkInfo | null;
}

/** Structured input for the parser, mirroring the relevant Telegram fields. */
export interface ParseInput {
  text?: string | null;
  caption?: string | null;
  telegram_message_id?: number | null;
  telegram_update_id?: number | null;
  /** Telegram `date` (unix seconds) → `published_at`. */
  date?: number | null;
}

/** The fields the parser extracts (R4.4). Absent data stays `null` (R4.13). */
export interface ParsedOffer {
  title: string;
  original_price: Decimal | null;
  current_price: Decimal;
  discount_percent: number | null;
  affiliate_url: string | null;
  merchant: string | null;
  platform: Platform | null;
  external_product_id: string | null;
  affiliate_tag: string | null;
  raw_text: string;
  telegram_message_id: number | null;
  telegram_update_id: number | null;
  published_at: string | null;
  needs_review: boolean;
}

/** Reasons the parser rejects an offer outright (R4.10, R4.11). */
export type PriceRejection =
  | "missing_price"
  | "negative_price"
  | "absurd_price"
  | "current_ge_original";

/** Discriminated result of {@link parseOffer}. */
export type ParseResult =
  | { ok: true; offer: ParsedOffer }
  | { ok: false; reason: PriceRejection };

/** Outcome of reconciling the written discount against the computed one. */
export interface DiscountResult {
  discountPercent: number | null;
  needsReview: boolean;
}

/**
 * Upper bound for a believable MXN price. Anything strictly greater is treated
 * as "absurd" and rejected (R4.10). Comfortably above any real consumer deal
 * yet well within `NUMERIC(12,2)`.
 */
export const MAX_REASONABLE_PRICE = new Decimal(10_000_000);

// ---------------------------------------------------------------------------
// Price validity and discount reconciliation (the correctness heart, R4.7–R4.11)
// ---------------------------------------------------------------------------

/**
 * Validates the price pair (R4.10, R4.11). A `current` price must exist, be
 * non-negative, non-zero and not absurd. When an `original` price is present it
 * must be valid and strictly greater than `current`.
 */
export function evaluatePrices(
  original: Decimal | null,
  current: Decimal | null,
): { ok: true } | { ok: false; reason: PriceRejection } {
  if (current === null) {
    return { ok: false, reason: "missing_price" };
  }
  if (current.isNegative()) {
    return { ok: false, reason: "negative_price" };
  }
  if (current.isZero() || current.greaterThan(MAX_REASONABLE_PRICE)) {
    return { ok: false, reason: "absurd_price" };
  }
  if (original !== null) {
    if (original.isNegative()) {
      return { ok: false, reason: "negative_price" };
    }
    if (original.isZero() || original.greaterThan(MAX_REASONABLE_PRICE)) {
      return { ok: false, reason: "absurd_price" };
    }
    if (current.greaterThanOrEqualTo(original)) {
      return { ok: false, reason: "current_ge_original" };
    }
  }
  return { ok: true };
}

/**
 * Recomputes the discount with exact decimal arithmetic and reconciles it
 * against the written percentage (R4.7, R4.8, R4.9):
 *  - No original price → `discount_percent = null`, no review (R4.12).
 *  - Stored value is always the *computed* integer percent (reusing the exact
 *    money math in `lib/utils/money`), clamped to `[0, 100]`.
 *  - If the absolute drift between the written and the exact computed percent is
 *    `> 1`pp, the offer is flagged `needs_review`; `<= 1`pp is silently
 *    corrected.
 *
 * Precondition (guaranteed by {@link evaluatePrices} upstream): when `original`
 * is non-null, `original > current >= 0`, so the division is well defined.
 */
export function reconcileDiscount(
  original: Decimal | null,
  current: Decimal,
  writtenPct: number | null,
): DiscountResult {
  if (original === null) {
    return { discountPercent: null, needsReview: false };
  }
  const stored = computeDiscountPercent(original, current);
  if (writtenPct === null) {
    return { discountPercent: stored, needsReview: false };
  }
  const exact = original.minus(current).dividedBy(original).times(100).toNumber();
  const drift = Math.abs(writtenPct - exact);
  return { discountPercent: stored, needsReview: drift > 1 };
}

// ---------------------------------------------------------------------------
// Price scanning
// ---------------------------------------------------------------------------

/**
 * A number body: an integer with optional thousands groups (separated by `.`,
 * `,` or a space) and an optional 1–2 digit fraction, or a plain integer with
 * an optional fraction. The thousands-vs-decimal ambiguity is resolved later in
 * {@link parsePrice}.
 */
const NUM = String.raw`\d{1,3}(?:[.,\s\u00a0]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

const DOLLAR_RE = new RegExp(String.raw`\$\s*(-?(?:${NUM}))`, "gi");
const MXN_SUFFIX_RE = new RegExp(String.raw`(-?(?:${NUM}))\s*(?:mxn|pesos)\b`, "gi");
const MXN_PREFIX_RE = new RegExp(String.raw`\bmxn\s*\$?\s*(-?(?:${NUM}))`, "gi");
const BARE_NUM_RE = new RegExp(String.raw`(-?(?:${NUM}))`, "gi");

const ORIGINAL_LABEL_RE =
  /\b(?:antes|precio\s+normal|precio\s+regular|precio\s+de\s+lista|de\s+lista|precio\s+anterior|normalmente|anteriormente)\b/i;
const CURRENT_LABEL_RE =
  /\b(?:ahora|oferta|hoy|s[oó]lo|solo|ll[eé]valo|precio\s+oferta|precio\s+final|precio\s+especial|rebajado)\b/i;

/** Keyword cue that a line is price-related, gating bare-number extraction. */
const PRICE_KEYWORD_RE =
  /\b(?:antes|ahora|oferta|precio|regular|normal|lista|hoy|s[oó]lo|solo|descuento|rebaja|mxn|pesos|ll[eé]valo|anterior|especial|final)\b/i;

type PriceLabel = "original" | "current" | null;

function lineLabel(line: string): PriceLabel {
  if (ORIGINAL_LABEL_RE.test(line)) return "original";
  if (CURRENT_LABEL_RE.test(line)) return "current";
  return null;
}

/**
 * Resolves the thousands/decimal ambiguity of a numeric token and parses it to
 * an exact `Decimal`. Handles US/MX (`1,299.00`), European (`1.299,00`), plain
 * (`899`, `199.00`) and space-grouped (`1 299.00`) formats. Returns `null` when
 * the token is not a parseable amount.
 */
function parsePrice(token: string): Decimal | null {
  let s = token.replace(/[\s\u00a0]/g, "");
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (s === "") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // European: dots are thousands, the last comma is the decimal separator.
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // US/MX: commas are thousands.
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    if (/^\d{1,3},\d{2}$/.test(s)) {
      // A lone comma with exactly two trailing digits reads as a decimal.
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  }

  try {
    const dec = toMoney(s);
    return negative ? dec.negated() : dec;
  } catch {
    return null;
  }
}

interface SpanTok {
  start: number;
  end: number;
  value: Decimal;
}

/** Extracts the money amounts present in a single line, in left-to-right order. */
function moneyTokensInLine(line: string): Decimal[] {
  const toks: SpanTok[] = [];

  const consider = (re: RegExp, group: number): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const start = m.index;
      const end = m.index + m[0].length;
      // A number directly followed by "%" is a percentage, not a price.
      if (/^\s*%/.test(line.slice(end))) continue;
      // Skip a candidate overlapping an already-accepted token.
      if (toks.some((t) => start < t.end && end > t.start)) continue;
      const value = parsePrice(m[group]);
      if (value !== null) toks.push({ start, end, value });
    }
  };

  consider(DOLLAR_RE, 1);
  consider(MXN_SUFFIX_RE, 1);
  consider(MXN_PREFIX_RE, 1);
  // Only fall back to bare numbers on an unmistakably price-related line that
  // carried no currency symbol, to avoid treating model numbers as prices.
  if (toks.length === 0 && PRICE_KEYWORD_RE.test(line)) {
    consider(BARE_NUM_RE, 1);
  }

  return toks.sort((a, b) => a.start - b.start).map((t) => t.value);
}

interface PricedToken {
  value: Decimal;
  label: PriceLabel;
}

function maxOf(values: Decimal[]): Decimal | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => (v.greaterThan(acc) ? v : acc), values[0]);
}

function minOf(values: Decimal[]): Decimal | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => (v.lessThan(acc) ? v : acc), values[0]);
}

/**
 * Decides which extracted amounts are the original and current prices using
 * explicit "antes"/"ahora"-style labels first, then magnitude as a fallback
 * (the larger of two unlabeled prices is the original).
 */
function selectPrices(toks: PricedToken[]): {
  original: Decimal | null;
  current: Decimal | null;
} {
  if (toks.length === 0) return { original: null, current: null };

  const labeledOriginal = toks.find((t) => t.label === "original") ?? null;
  const labeledCurrent = toks.find((t) => t.label === "current") ?? null;

  if (labeledOriginal && labeledCurrent) {
    return { original: labeledOriginal.value, current: labeledCurrent.value };
  }

  if (labeledCurrent && !labeledOriginal) {
    const others = toks.filter((t) => t !== labeledCurrent).map((t) => t.value);
    const maxOther = maxOf(others);
    const original =
      maxOther && maxOther.greaterThan(labeledCurrent.value) ? maxOther : null;
    return { original, current: labeledCurrent.value };
  }

  if (labeledOriginal && !labeledCurrent) {
    const others = toks.filter((t) => t !== labeledOriginal).map((t) => t.value);
    if (others.length > 0) {
      return { original: labeledOriginal.value, current: minOf(others) };
    }
    // A single price mislabeled "antes" with nothing else is the current price.
    return { original: null, current: labeledOriginal.value };
  }

  const values = toks.map((t) => t.value);
  if (values.length === 1) return { original: null, current: values[0] };
  return { original: maxOf(values), current: minOf(values) };
}

/** First written percentage in the text (the discount, R4.8). */
function extractWrittenPercent(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Title and link detection
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function isPromotionalLine(line: string): boolean {
  if (/\d\s*%/.test(line)) return true; // percentage
  if (/https?:\/\//i.test(line)) return true; // URL
  if (/\$\s*\d/.test(line)) return true; // $ price
  if (/\d\s*(?:mxn|pesos)\b/i.test(line) || /\b(?:mxn|pesos)\s*\$?\s*\d/i.test(line)) {
    return true; // MXN price
  }
  if ((ORIGINAL_LABEL_RE.test(line) || CURRENT_LABEL_RE.test(line)) && /\d/.test(line)) {
    return true; // labeled price line
  }
  return false;
}

/** Title = the text before the first promotional line (R4.6). */
function detectTitle(lines: string[]): string {
  const idx = lines.findIndex((l) => l.trim() !== "" && isPromotionalLine(l));
  const slice = idx === -1 ? lines : lines.slice(0, idx);
  return slice
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join(" ")
    .trim();
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  if (!matches) return [];
  return matches.map((raw) =>
    raw
      .replace(/\\/g, "") // drop escaped link characters (R4.2)
      .replace(/[.,;:!?)\]]+$/, ""), // trim trailing punctuation
  );
}

/** Returns the first allowed-merchant URL according to the injected port (R4.5). */
function detectFirstLink(text: string, link: LinkPort): LinkInfo | null {
  for (const url of extractUrls(text)) {
    const info = link.detect(url);
    if (info) return info;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal link port (wired in Task 5)
// ---------------------------------------------------------------------------

const DEFAULT_TRACKING_ID = "programadormx-20";
const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Za-z0-9]{10})/;

function hostPlatform(host: string): Platform | null {
  const h = host.toLowerCase();
  if (h === "amzn.to") return "amazon";
  if (h === "meli.la") return "mercado_libre";
  if (h === "amazon.com.mx" || h.endsWith(".amazon.com.mx")) return "amazon";
  if (h === "mercadolibre.com.mx" || h.endsWith(".mercadolibre.com.mx")) {
    return "mercado_libre";
  }
  return null;
}

function extractAsin(u: URL): string | null {
  const m = u.pathname.match(ASIN_RE);
  if (m) return m[1].toUpperCase();
  const q = u.searchParams.get("asin");
  return q && /^[A-Za-z0-9]{10}$/.test(q) ? q.toUpperCase() : null;
}

function extractMlm(u: URL): string | null {
  const haystack = `${u.pathname} ${u.search}`.toUpperCase();
  const m = haystack.match(/MLM-?(\d+)/);
  return m ? `MLM${m[1]}` : null;
}

/**
 * Minimal allowed-merchant detector: a zero-config fallback used when no
 * SSRF-backed port is injected. Performs no network I/O. Accepts only HTTPS
 * URLs on the initial allowlist, extracts ASIN/MLM when present, and preserves
 * the Amazon `tag` while flagging a mismatch against the default tracking id
 * (R5.6–R5.8). The production port with the full SSRF validator, short-link
 * resolver and configurable allowlist/tracking id is `createLinkPort` from
 * `@/lib/ssrf`.
 */
export const defaultLinkPort: LinkPort = {
  detect(rawUrl: string): LinkInfo | null {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;

    const platform = hostPlatform(url.hostname);
    if (platform === null) return null;

    if (platform === "amazon") {
      const tag = url.searchParams.get("tag");
      return {
        url: rawUrl,
        platform,
        merchant: "Amazon México",
        externalProductId: extractAsin(url),
        affiliateTag: tag,
        needsReview: tag !== null && tag !== DEFAULT_TRACKING_ID,
      };
    }

    return {
      url: rawUrl,
      platform,
      merchant: "Mercado Libre",
      externalProductId: extractMlm(url),
      affiliateTag: null,
      needsReview: false,
    };
  },
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Parses a Telegram message into a structured offer, or rejects it.
 *
 * @param input  The message fields (`text`/`caption` plus metadata).
 * @param link   Allowed-merchant detector; defaults to {@link defaultLinkPort}.
 */
export function parseOffer(input: ParseInput, link: LinkPort = defaultLinkPort): ParseResult {
  const rawParts = [input.text, input.caption].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const raw = rawParts.join("\n");
  const norm = normalizeText(raw);
  const lines = norm.length > 0 ? norm.split("\n") : [];

  const title = detectTitle(lines);
  const writtenPct = extractWrittenPercent(norm);

  const priced: PricedToken[] = [];
  for (const line of lines) {
    const label = lineLabel(line);
    for (const value of moneyTokensInLine(line)) {
      priced.push({ value, label });
    }
  }

  const { original, current } = selectPrices(priced);

  const verdict = evaluatePrices(original, current);
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason };
  }
  if (current === null) {
    // Unreachable when `verdict.ok` is true; kept for type narrowing.
    return { ok: false, reason: "missing_price" };
  }

  const { discountPercent, needsReview: discountReview } = reconcileDiscount(
    original,
    current,
    writtenPct,
  );

  const linkInfo = detectFirstLink(norm, link);

  const offer: ParsedOffer = {
    title,
    original_price: original,
    current_price: current,
    discount_percent: discountPercent,
    affiliate_url: linkInfo?.url ?? null,
    merchant: linkInfo?.merchant ?? null,
    platform: linkInfo?.platform ?? null,
    external_product_id: linkInfo?.externalProductId ?? null,
    affiliate_tag: linkInfo?.affiliateTag ?? null,
    raw_text: raw,
    telegram_message_id: input.telegram_message_id ?? null,
    telegram_update_id: input.telegram_update_id ?? null,
    published_at:
      typeof input.date === "number" ? new Date(input.date * 1000).toISOString() : null,
    needs_review: discountReview || (linkInfo?.needsReview ?? false),
  };

  return { ok: true, offer };
}
