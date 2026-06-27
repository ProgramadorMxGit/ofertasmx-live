/**
 * Premium-effect gate (Task 22.1 / R14.4, R14.5).
 *
 * The decision of whether an `OfferCard` may render its premium flourish
 * (localized spotlight / border glow) is **pure boolean logic**, deliberately
 * separated from any DOM/`matchMedia` access so it can be exhaustively verified
 * (see Property 19). The thin Client wrapper `PremiumCardFx` is responsible for
 * reading the runtime signals (pointer type, reduced-motion, Save-Data) and
 * feeding them here; this module never touches `window`.
 *
 * Effects are enabled **if and only if** the card is featured AND it is in the
 * first row AND the pointer is fine (precise, desktop-class) AND the user has
 * NOT requested reduced motion AND Save-Data is NOT active. A single adverse
 * condition is enough to disable them (accessibility/performance > design).
 */

/** The five independent signals that gate the premium effect. */
export interface PremiumEffectConditions {
  /** The offer is marked as featured (`is_featured`). */
  readonly isFeatured: boolean;
  /** The card is rendered in the first visual row of its collection. */
  readonly isFirstRow: boolean;
  /** A precise pointer is available (`(pointer: fine)`), i.e. desktop-class. */
  readonly pointerFine: boolean;
  /** The user requested reduced motion (`prefers-reduced-motion: reduce`). */
  readonly reducedMotion: boolean;
  /** The user opted into data saving (`Save-Data` / `connection.saveData`). */
  readonly saveData: boolean;
}

/**
 * Whether the premium card effect should be enabled for the given conditions
 * (R14.4, R14.5). Pure and total: every combination of the five booleans maps
 * to a deterministic result, enabled only when all conditions are favorable.
 */
export function shouldEnablePremiumEffect(
  conditions: PremiumEffectConditions,
): boolean {
  return (
    conditions.isFeatured &&
    conditions.isFirstRow &&
    conditions.pointerFine &&
    !conditions.reducedMotion &&
    !conditions.saveData
  );
}
