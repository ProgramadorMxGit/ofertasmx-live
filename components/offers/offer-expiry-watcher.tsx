"use client";

import { TimerOff } from "lucide-react";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * `OfferExpiryWatcher` — detects that an offer ended *while being viewed* (R9.6,
 * R15.3).
 *
 * The detail page only renders for an `active` offer (an already-expired one is
 * hidden by RLS and 404s), so this small Client island watches for the
 * transition to expired/removed and surfaces the calm "Esta oferta podría haber
 * terminado" notice that points to the related offers — without hard-failing
 * the page. It never hides the content beneath it.
 *
 * Two lightweight signals, no extra server route:
 *   - **Local fast path:** if `expiresAt` is set, a timer flips the notice on at
 *     that instant (a passed `expires_at` means the offer is effectively over
 *     even before the maintenance Cron flips its status, R9.9/R9.10).
 *   - **Polling:** every minute it re-checks the row through the anon browser
 *     client; once RLS no longer returns it as `active` (expired/hidden/removed)
 *     the notice appears. Transient errors are ignored so a blip never
 *     false-positives.
 */
export interface OfferExpiryWatcherProps {
  offerId: string;
  /** The offer's `expires_at` (ISO) or `null` when it never expires by time. */
  expiresAt: string | null;
  /** Where "ver ofertas relacionadas" points (an in-page anchor). */
  relatedHref?: string;
}

const POLL_INTERVAL_MS = 60_000;
/** `setTimeout` clamps above ~24.8 days; skip far-future timers (polling covers it). */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function OfferExpiryWatcher({
  offerId,
  expiresAt,
  relatedHref = "#ofertas-relacionadas",
}: OfferExpiryWatcherProps) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (expired) return;

    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const markExpired = (): void => {
      if (!cancelled) setExpired(true);
    };

    // Local fast path from `expires_at`.
    if (expiresAt) {
      const ms = Date.parse(expiresAt) - Date.now();
      if (Number.isFinite(ms)) {
        if (ms <= 0) {
          markExpired();
          return () => {
            cancelled = true;
          };
        }
        if (ms <= MAX_TIMEOUT_MS) timers.push(setTimeout(markExpired, ms));
      }
    }

    const supabase = createBrowserSupabaseClient();
    const check = async (): Promise<void> => {
      try {
        const { data, error } = await supabase
          .from("offers")
          .select("id")
          .eq("id", offerId)
          .eq("status", "active")
          .maybeSingle<{ id: string }>();
        if (cancelled) return;
        // No error + no row → no longer active for anon (expired/hidden/removed).
        if (!error && data === null) markExpired();
      } catch {
        // Transient failure: ignore, the next tick retries.
      }
    };

    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [expired, expiresAt, offerId]);

  if (!expired) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <TimerOff
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-warning"
        strokeWidth={2}
      />
      <div className="min-w-0">
        <p className="text-body font-medium text-foreground">
          Esta oferta podría haber terminado
        </p>
        <p className="text-meta text-muted-foreground">
          El precio o la disponibilidad pueden haber cambiado en la tienda.{" "}
          <a
            href={relatedHref}
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Ver ofertas relacionadas
          </a>
          .
        </p>
      </div>
    </div>
  );
}
