import { Decimal } from "decimal.js";

/**
 * Money utilities backed by exact decimal arithmetic (R4.7).
 *
 * Every monetary and percentage operation in the System uses `decimal.js`
 * (`Decimal`) — never JavaScript floating point — to avoid rounding drift such
 * as the classic `0.1 + 0.2 !== 0.3`. Mexican peso (MXN) amounts are quantized
 * to two decimal places (centavos), matching PostgreSQL `NUMERIC(12,2)`.
 *
 * All functions are pure (no I/O), which makes them verifiable by both unit
 * tests and property-based tests (R29.1).
 */

/** Number of decimal places for an MXN amount (centavos). */
export const MXN_DECIMAL_PLACES = 2;

/** A monetary amount represented with exact decimal precision. */
export type Money = Decimal;

/** Input accepted by the money helpers. */
export type MoneyInput = string | number | Decimal;

/** Thrown when a value cannot be interpreted as a valid monetary amount. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/**
 * Strips an MXN-formatted price string down to a bare number.
 *
 * Tolerates the `$` symbol, the `MXN` marker, unicode spaces (including NBSP)
 * and comma thousands separators (the `1,299.00` format). The dot is treated
 * as the decimal separator. Disambiguating European formats (`1.299,00`) is
 * the job of the message parser (`lib/parser`), not this low-level helper.
 */
function cleanMoneyString(raw: string): string {
  return raw
    .replace(/mxn/gi, "")
    .replace(/\$/g, "")
    .replace(/[\s\u00a0\u202f\u2009]/g, "")
    .replace(/,/g, "");
}

/**
 * Converts a string, number or `Decimal` into a `Decimal` amount quantized to
 * two decimals (MXN centavos semantics). Throws {@link MoneyError} when the
 * input does not represent a finite number.
 *
 * Strings are preferred for exactness; numbers are read at their displayed
 * value by `decimal.js`, so callers must avoid doing floating-point math
 * before passing a value in.
 */
export function toMoney(value: MoneyInput): Decimal {
  let dec: Decimal;

  if (value instanceof Decimal) {
    dec = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MoneyError(`Importe numérico no finito: ${value}`);
    }
    dec = new Decimal(value);
  } else {
    const cleaned = cleanMoneyString(value);
    if (cleaned === "" || cleaned === "-" || cleaned === ".") {
      throw new MoneyError(`Importe vacío o no numérico: "${value}"`);
    }
    try {
      dec = new Decimal(cleaned);
    } catch {
      throw new MoneyError(`Importe no parseable: "${value}"`);
    }
  }

  if (!dec.isFinite()) {
    throw new MoneyError("Importe no finito");
  }

  return dec.toDecimalPlaces(MXN_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

/**
 * Computes the exact discount percent `((original - current) / original) * 100`,
 * rounded to the nearest integer (half-up) and clamped to the range
 * `[0, 100]` (R4.7).
 *
 * Throws {@link MoneyError} when the original price is not greater than zero,
 * since the discount is undefined in that case (the parser only calls this
 * function when a valid original price is present).
 */
export function discountPercent(original: MoneyInput, current: MoneyInput): number {
  const originalDec = toMoney(original);
  const currentDec = toMoney(current);

  if (originalDec.lessThanOrEqualTo(0)) {
    throw new MoneyError(
      "El precio original debe ser mayor que cero para calcular el descuento",
    );
  }

  const raw = originalDec
    .minus(currentDec)
    .dividedBy(originalDec)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const clamped = Decimal.min(100, Decimal.max(0, raw));
  return clamped.toNumber();
}

/**
 * Returns the absolute savings `original - current` with exact decimal
 * arithmetic (R14.1, Property 18). When `original >= current` the result is
 * always `>= 0`; that price relationship is guaranteed upstream by the parser
 * rules and the database constraints (R4.11, R6.7).
 */
export function absoluteSavings(original: MoneyInput, current: MoneyInput): Decimal {
  return toMoney(original).minus(toMoney(current));
}

/** Options for {@link formatMXN}. */
export interface FormatMXNOptions {
  /** Include the leading `$` symbol. Defaults to `true`. */
  withSymbol?: boolean;
}

/**
 * Formats an amount as an MXN price with thousands separators and two
 * decimals, e.g. `$1,299.00`. The output always carries a fixed number of
 * decimals so that, combined with `font-variant-numeric: tabular-nums` in the
 * UI, digits line up in columns (R12.6).
 */
export function formatMXN(value: MoneyInput, options: FormatMXNOptions = {}): string {
  const { withSymbol = true } = options;
  const dec = toMoney(value);
  const negative = dec.isNegative() && !dec.isZero();
  const fixed = dec.abs().toFixed(MXN_DECIMAL_PLACES);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : "";
  const symbol = withSymbol ? "$" : "";
  return `${sign}${symbol}${grouped}.${decPart}`;
}

export { Decimal };
