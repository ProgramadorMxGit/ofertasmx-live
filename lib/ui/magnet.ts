/**
 * Magnet geometry (Task 32.2 / R18.2, R18.3).
 *
 * The "magnet" effect nudges a desktop CTA a few pixels toward the cursor while
 * it hovers. The *decision math* is pure and DOM-free so it can be unit-tested
 * exhaustively (mirroring the `premium-effects` gate pattern); the thin Client
 * wrapper `components/ui/magnet.tsx` reads the pointer + element rect at runtime,
 * throttles with `requestAnimationFrame` (R18.3) and applies the result as a
 * `transform` only (R18.2).
 *
 * The offset is the vector from the element center to the pointer, scaled by
 * `strength` (0..1) and clamped to `±maxTranslate` px on each axis, so the
 * effect stays subtle and never animates layout.
 */

/** Minimal element rectangle (a subset of `DOMRect`). */
export interface MagnetRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Inputs for {@link computeMagnetOffset}. */
export interface MagnetInput {
  /** Pointer X in the same coordinate space as `rect` (e.g. viewport px). */
  readonly pointerX: number;
  /** Pointer Y in the same coordinate space as `rect`. */
  readonly pointerY: number;
  /** The target element's rectangle. */
  readonly rect: MagnetRect;
  /** Fraction of the center→pointer vector applied (0..1). */
  readonly strength: number;
  /** Maximum absolute translation per axis, in px (>= 0). */
  readonly maxTranslate: number;
}

/** A transform-only translation, in px. */
export interface MagnetOffset {
  readonly x: number;
  readonly y: number;
}

/** The neutral, no-movement offset. */
export const NO_OFFSET: MagnetOffset = { x: 0, y: 0 } as const;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Compute the subtle magnet translation for a pointer over an element.
 *
 * Pure and total: returns {@link NO_OFFSET} when the pointer sits at the element
 * center, when `strength` is 0 or when `maxTranslate` is 0; otherwise a vector
 * pointing toward the cursor, clamped to `±maxTranslate` on each axis. Non-finite
 * inputs (NaN/Infinity) collapse to no movement so a bad measurement can never
 * push the element off-screen.
 */
export function computeMagnetOffset(input: MagnetInput): MagnetOffset {
  const { pointerX, pointerY, rect, strength, maxTranslate } = input;

  const max = Number.isFinite(maxTranslate) ? Math.max(0, maxTranslate) : 0;
  const s = Number.isFinite(strength) ? clamp(strength, 0, 1) : 0;
  if (max === 0 || s === 0) return NO_OFFSET;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = pointerX - centerX;
  const dy = pointerY - centerY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return NO_OFFSET;

  return {
    x: clamp(dx * s, -max, max),
    y: clamp(dy * s, -max, max),
  };
}
