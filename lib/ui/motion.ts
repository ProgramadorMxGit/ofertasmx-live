/**
 * Animation system base (Task 20.4 / R18).
 *
 * Single source of truth for motion *values* shared by CSS (via the matching
 * custom properties in `app/globals.css`) and JS/Motion (`framer-motion`).
 * This module is framework-agnostic and SSR-safe so it can be imported from
 * Server or Client Components alike. The React hook that subscribes to
 * `prefers-reduced-motion` lives in `./use-reduced-motion` (Client only).
 *
 * Guardrails encoded here:
 * - Only `opacity` and `transform` are animated (the variants below) — never
 *   layout properties like width/height/top/left (R18.2).
 * - `prefersReducedMotion()` lets callers skip non-essential motion; combined
 *   with the global `@media (prefers-reduced-motion: reduce)` rule, motion is
 *   removed while all functionality is preserved (R18.5).
 * - These are presentation helpers only; they never gate or delay content, so
 *   the H1/main content (LCP) is never gated behind motion (R18.6).
 */

/** Duration tokens in milliseconds (R18.1). */
export const DURATION = {
  instant: 120, // 100-140ms
  fast: 190, // 160-220ms
  normal: 280, // 240-320ms
  editorial: 520, // 450-650ms
} as const;

export type DurationToken = keyof typeof DURATION;

/** Same tokens in seconds, for `framer-motion` transition configs. */
export const DURATION_S = {
  instant: DURATION.instant / 1000,
  fast: DURATION.fast / 1000,
  normal: DURATION.normal / 1000,
  editorial: DURATION.editorial / 1000,
} as const;

/** Primary easing curve (R18.1). */
export const EASE_EMPHASIZED = "cubic-bezier(0.22, 1, 0.36, 1)" as const;

/** The same curve as control points, for `framer-motion`. */
export const EASE_EMPHASIZED_POINTS: readonly [number, number, number, number] =
  [0.22, 1, 0.36, 1];

/** The media query used both here and by the `useReducedMotion` hook. */
export const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * SSR-safe check for the user's reduced-motion preference.
 * Returns `false` when there is no DOM (server) or `matchMedia` is missing, so
 * content is never gated on this resolving — the CSS media query is the
 * authoritative runtime guard.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;
}

/** Build a `framer-motion` transition from a duration token + emphasized easing. */
export function transition(token: DurationToken = "normal"): {
  duration: number;
  ease: [number, number, number, number];
} {
  return {
    duration: DURATION_S[token],
    ease: [...EASE_EMPHASIZED_POINTS],
  };
}

/**
 * `framer-motion` variants — opacity/transform only (R18.2). Use for card
 * entrances, list items and highlights. Pair with `transition()`.
 */
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
} as const;

export const fadeInUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
} as const;
