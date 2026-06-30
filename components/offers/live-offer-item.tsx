"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";

import type { PublicOffer } from "@/lib/offers/query";
import type { ChangedField } from "@/lib/offers/realtime-reducer";
import { fadeInUp, transition } from "@/lib/ui/motion";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";
import { cn } from "@/lib/utils/cn";

import { OfferCard } from "./offer-card";

/**
 * `LiveOfferItem` — a single `<li>` in the live grid/list (Task 24.2 / R9.2, R9.4).
 *
 * Wraps the (Server) {@link OfferCard} with the two realtime affordances:
 *  - a brief **entrance animation** for offers inserted live (`isNew`), built
 *    from the shared `lib/ui/motion` variants so it animates only opacity +
 *    transform (R18.2) and is skipped entirely under `prefers-reduced-motion`
 *    (R18.5) — existing cards never re-animate, so an update does not churn the
 *    grid (R9.4);
 *  - a short, subtle **highlight ring** when a field changed on an update
 *    (R9.4), auto-cleared via `onHighlightEnd` once the animation elapses.
 *
 * The highlight is purely visual (decorative); screen-reader announcements stay
 * with the single polite notice (R25.6).
 */

/** How long the update highlight ring stays before it is cleared (ms). */
const HIGHLIGHT_MS = 2_200;

export interface LiveOfferItemProps {
  offer: PublicOffer;
  isFirstRow: boolean;
  priority: boolean;
  /** Inserted live → play the brief entrance animation. */
  isNew: boolean;
  /** A changed field to highlight briefly, or `undefined` for no highlight. */
  highlight?: ChangedField;
  onHighlightEnd?: (id: string) => void;
  /** Derived `SHOW_AMAZON_PRICES` flag, forwarded to the card (R22.2). */
  showAmazonPrices: boolean;
}

export function LiveOfferItem({
  offer,
  isFirstRow,
  priority,
  isNew,
  highlight,
  onHighlightEnd,
  showAmazonPrices,
}: LiveOfferItemProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!highlight) return;
    const handle = setTimeout(() => onHighlightEnd?.(offer.id), HIGHLIGHT_MS);
    return () => clearTimeout(handle);
  }, [highlight, offer.id, onHighlightEnd]);

  const highlightClass = highlight
    ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
    : "ring-0";

  const className = cn(
    "h-full rounded-[var(--radius-card)] transition-shadow duration-normal ease-emphasized",
    "motion-reduce:transition-none",
    highlightClass,
  );

  const card = (
    <OfferCard
      offer={offer}
      isFirstRow={isFirstRow}
      priority={priority}
      showAmazonPrices={showAmazonPrices}
    />
  );

  // Entrance animation only for live inserts, and only when motion is allowed.
  if (isNew && !reducedMotion) {
    return (
      <motion.li
        layout="position"
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        transition={transition("normal")}
        className={className}
      >
        {card}
      </motion.li>
    );
  }

  return <li className={className}>{card}</li>;
}
