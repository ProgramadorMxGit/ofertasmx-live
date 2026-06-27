"use client";

import { ArrowUp, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * `NewOffersNotice` — the discreet "Nueva oferta encontrada" banner (R9.2).
 *
 * Rendered above the grid when live inserts arrive. It is intentionally calm
 * (R9.3): no sound, no focus steal, no scroll jump — it simply *offers* the
 * visitor a button to reveal the new offers. It is the single polite
 * `aria-live` surface for the feed (R25.6), so a screen reader hears
 * "Nueva oferta encontrada" once rather than one announcement per field change.
 */
export interface NewOffersNoticeProps {
  /** Number of pending new offers; the banner hides when this is 0. */
  count: number;
  /** Acknowledge / reveal the new offers. */
  onShow?: () => void;
  className?: string;
}

export function NewOffersNotice({ count, onShow, className }: NewOffersNoticeProps) {
  if (count <= 0) return null;

  const label =
    count === 1 ? "Nueva oferta encontrada" : `${count} nuevas ofertas encontradas`;

  return (
    <div role="status" aria-live="polite" className={cn("flex justify-center", className)}>
      <button
        type="button"
        onClick={onShow}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2",
          "text-meta font-medium text-foreground",
          "transition-colors duration-fast ease-emphasized hover:bg-primary/15",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        )}
      >
        <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" strokeWidth={2} />
        <span>{label}</span>
        <ArrowUp aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
