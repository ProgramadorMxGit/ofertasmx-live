"use client";

import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { z } from "zod";

import {
  PUBLIC_OFFER_COLUMNS,
  type OfferSort,
  type PublicOffer,
} from "@/lib/offers/query";
import {
  createInitialRealtimeState,
  realtimeReducer,
  type ChangedField,
  type ConnectionStatus,
} from "@/lib/offers/realtime-reducer";
import {
  createBrowserSupabaseClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase/browser";

/**
 * `useOffersRealtime` — live offers feed over Supabase Realtime (Task 24.1 / R9).
 *
 * Seeds from the SSR-provided `initial` list so the page is fully functional
 * without Realtime (R9.1), then opens a `postgres_changes` subscription on
 * `public.offers` through the **anon** browser client (so RLS only ever sends
 * `status='active'` rows). All state transitions go through the pure
 * {@link realtimeReducer}; this hook only owns the I/O: the channel, the wall
 * clock, exponential-backoff reconnection (R9.7) and the post-reconnect resync
 * that refetches rows changed since the last event (R9.8).
 *
 * Deliberate non-actions (R9.3): inserts never play a sound, never move focus
 * and never scroll — the entrance animation and the discreet
 * "Nueva oferta encontrada" notice are the only feedback, rendered by the grid.
 * Screen-reader announcements stay moderate (R25.6): the notice is the single
 * `aria-live` surface; per-field highlights are visual only.
 */

// ---------------------------------------------------------------------------
// Runtime validation of incoming rows (Realtime payloads are untyped).
// ---------------------------------------------------------------------------

/**
 * Runtime schema for a {@link PublicOffer}. Exported so other client surfaces
 * (e.g. the `/ofertas` "load more" fetch) validate untyped JSON against the
 * exact same shape rather than trusting `response.json()`.
 */
export const publicOfferSchema = z.object({
  id: z.string(),
  platform: z.enum(["amazon", "mercado_libre"]),
  merchant: z.string(),
  external_product_id: z.string().nullable(),
  title: z.string(),
  slug: z.string(),
  short_description: z.string().nullable(),
  editorial_summary: z.string().nullable(),
  image_url: z.string().nullable(),
  image_alt: z.string().nullable(),
  image_status: z.string(),
  original_price: z.number().nullable(),
  current_price: z.number(),
  discount_percent: z.number().nullable(),
  currency: z.string(),
  affiliate_url: z.string().nullable(),
  category_id: z.string().nullable(),
  status: z.enum(["draft", "active", "expired", "hidden", "rejected", "needs_review"]),
  is_featured: z.boolean(),
  published_at: z.string().nullable(),
  updated_at: z.string(),
  last_verified_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});

/** Parse an untyped Realtime row into a {@link PublicOffer}, or `null` if invalid. */
function parsePublicOffer(raw: unknown): PublicOffer | null {
  const result = publicOfferSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// E2E-only deterministic realtime seam (Task 38.1 / R29.4)
// ---------------------------------------------------------------------------

/**
 * Window event the Playwright suite dispatches to drive the feed deterministically
 * **without** the real Supabase Realtime channel or any credentials. It is only
 * wired up when the build sets `NEXT_PUBLIC_E2E=1`; in a normal build the seam is
 * dead code and the real channel is the sole source of events.
 */
export const REALTIME_TEST_EVENT = "ofertas:e2e-realtime";

/** Payload shape for {@link REALTIME_TEST_EVENT}; `offer` mirrors a Supabase row. */
export type RealtimeTestDetail =
  | { readonly kind: "insert"; readonly offer: unknown }
  | { readonly kind: "update"; readonly offer: unknown }
  | { readonly kind: "remove"; readonly id: string };

/** Whether the build opted into the e2e realtime seam. */
const E2E_REALTIME = process.env.NEXT_PUBLIC_E2E === "1";

// ---------------------------------------------------------------------------
// Reconnection backoff
// ---------------------------------------------------------------------------

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
/** Drop locally-expired offers on a slow cadence even with no events (R9.9). */
const PRUNE_INTERVAL_MS = 30_000;

/** Exponential backoff with a hard ceiling: 1s, 2s, 4s … capped at 30s (R9.7). */
function reconnectDelay(attempt: number): number {
  return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseOffersRealtimeResult {
  /** Offers in render order for the active sort. */
  readonly offers: readonly PublicOffer[];
  /** Realtime connection status for the connection indicator. */
  readonly status: ConnectionStatus;
  /** Pending "new offers" count for the discreet notice (R9.2). */
  readonly newCount: number;
  /** Ids inserted live; the grid gives these a brief entrance animation. */
  readonly newIds: ReadonlySet<string>;
  /** Per-offer field to briefly highlight after an update (R9.4). */
  readonly highlights: Readonly<Record<string, ChangedField>>;
  /** Acknowledge the new-offers notice (clears the count + flags). */
  readonly acknowledgeNew: () => void;
  /** Clear a field highlight once its animation has elapsed. */
  readonly clearHighlight: (id: string) => void;
}

export function useOffersRealtime(
  initial: readonly PublicOffer[],
  sort: OfferSort = "recent",
): UseOffersRealtimeResult {
  const [state, dispatch] = useReducer(
    realtimeReducer,
    undefined,
    () => createInitialRealtimeState(initial, sort, Date.now()),
  );

  // Realtime is a progressive enhancement (R9.1). Without public Supabase config
  // `createBrowserClient` would throw during render and 500 the page, so when it
  // is absent we keep the SSR/initial list and report an honest "offline" status
  // instead of opening a channel.
  const supabase = useMemo(
    () => (isSupabaseBrowserConfigured() ? createBrowserSupabaseClient() : null),
    [],
  );

  // Mirror `lastEventTs` into a ref so the async resync reads the latest value
  // without re-subscribing the channel.
  const lastEventTsRef = useRef(state.lastEventTs);
  useEffect(() => {
    lastEventTsRef.current = state.lastEventTs;
  }, [state.lastEventTs]);

  // Re-seed when the SSR list or sort changes (skip the initial mount, which the
  // reducer initializer already seeded).
  const seeded = useRef(true);
  useEffect(() => {
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    dispatch({ type: "SEED", offers: initial, sort, now: Date.now() });
  }, [initial, sort]);

  // Refetch rows changed since the last seen event and merge them in (R9.8).
  const resync = useCallback(async (): Promise<void> => {
    if (!supabase) return;
    const since = lastEventTsRef.current;
    let request = supabase
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("status", "active");
    if (since) request = request.gt("updated_at", since);

    const { data, error } = await request.returns<PublicOffer[]>();
    if (error || !data) return;
    dispatch({ type: "RESYNC", offers: data, now: Date.now() });
  }, [supabase]);

  // Channel lifecycle: subscribe, dispatch events, reconnect with backoff.
  useEffect(() => {
    // Under the e2e seam the real channel is bypassed entirely (the suite injects
    // events via {@link REALTIME_TEST_EVENT}); status is set "live" by that effect.
    if (E2E_REALTIME) return;

    // No client → Supabase isn't configured (e.g. local dev without creds): keep
    // the SSR list and report "offline" rather than opening a channel (R9.1).
    if (!supabase) {
      dispatch({ type: "SET_STATUS", status: "offline" });
      return;
    }
    const client = supabase;

    let disposed = false;
    let attempt = 0;
    let hasConnected = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof client.channel> | null = null;

    const teardownChannel = (): void => {
      if (channel) {
        void client.removeChannel(channel);
        channel = null;
      }
    };

    const scheduleReconnect = (): void => {
      if (disposed) return;
      dispatch({ type: "SET_STATUS", status: "reconnecting" });
      const delay = reconnectDelay(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect(): void {
      if (disposed) return;
      teardownChannel();

      channel = client
        .channel("public:offers")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "offers" },
          (payload) => {
            const offer = parsePublicOffer(payload.new);
            if (offer) dispatch({ type: "INSERT", offer, now: Date.now() });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "offers" },
          (payload) => {
            const offer = parsePublicOffer(payload.new);
            if (offer) dispatch({ type: "UPDATE", offer, now: Date.now() });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "offers" },
          (payload) => {
            const id = (payload.old as { id?: unknown }).id;
            if (typeof id === "string") dispatch({ type: "REMOVE", id });
          },
        )
        .subscribe((subscribeStatus) => {
          if (disposed) return;
          if (subscribeStatus === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            attempt = 0;
            dispatch({ type: "SET_STATUS", status: "live" });
            // Only resync after an actual reconnect; the first subscribe already
            // has fresh SSR data.
            if (hasConnected) void resync();
            hasConnected = true;
          } else if (
            subscribeStatus === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
            subscribeStatus === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
            subscribeStatus === REALTIME_SUBSCRIBE_STATES.CLOSED
          ) {
            teardownChannel();
            scheduleReconnect();
          }
        });
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      teardownChannel();
    };
  }, [supabase, resync]);

  // Periodically drop locally-expired offers even if no event arrives (R9.9).
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "PRUNE_EXPIRED", now: Date.now() });
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // E2E-only deterministic realtime seam (Task 38.1 / R29.4): when enabled, mark
  // the feed "live" and apply injected INSERT/UPDATE/REMOVE events. Validated by
  // the same `parsePublicOffer` as real events, so it exercises the real path.
  useEffect(() => {
    if (!E2E_REALTIME || typeof window === "undefined") return;
    dispatch({ type: "SET_STATUS", status: "live" });

    const onTestEvent = (event: Event): void => {
      const detail = (event as CustomEvent<RealtimeTestDetail>).detail;
      if (!detail) return;
      if (detail.kind === "remove") {
        dispatch({ type: "REMOVE", id: detail.id });
        return;
      }
      const offer = parsePublicOffer(detail.offer);
      if (!offer) return;
      dispatch({
        type: detail.kind === "insert" ? "INSERT" : "UPDATE",
        offer,
        now: Date.now(),
      });
    };

    window.addEventListener(REALTIME_TEST_EVENT, onTestEvent as EventListener);
    return () =>
      window.removeEventListener(REALTIME_TEST_EVENT, onTestEvent as EventListener);
  }, []);

  const acknowledgeNew = useCallback(() => dispatch({ type: "ACK_NEW" }), []);
  const clearHighlight = useCallback(
    (id: string) => dispatch({ type: "CLEAR_HIGHLIGHT", id }),
    [],
  );

  return {
    offers: state.offers,
    status: state.status,
    newCount: state.newCount,
    newIds: state.newIds,
    highlights: state.highlights,
    acknowledgeNew,
    clearHighlight,
  };
}
