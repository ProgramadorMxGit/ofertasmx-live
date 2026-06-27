"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";

import type { ConnectionStatus } from "@/lib/offers/realtime-reducer";
import { cn } from "@/lib/utils/cn";

/**
 * `ConnectionIndicator` — discreet Realtime status (Task 24.2 / R9.7, R13.7).
 *
 * Shows "En vivo", "Conectando…" or "Reconectando…" wired to the hook status.
 * Status is conveyed by **icon + text**, never color alone (R25.5): the live
 * state pairs a small pulsing dot and a Wi-Fi glyph with the label, while
 * connecting/reconnecting use a spinning refresh glyph (paused under
 * `prefers-reduced-motion`). It carries `role="status"` + `aria-live="polite"`
 * so a connection change is announced once, moderately (R25.6).
 */

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "Conectando…",
  live: "En vivo",
  reconnecting: "Reconectando…",
  offline: "Sin conexión en vivo",
};

export interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  className?: string;
}

export function ConnectionIndicator({ status, className }: ConnectionIndicatorProps) {
  const isLive = status === "live";
  const isOffline = status === "offline";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1",
        "text-meta font-medium",
        isLive ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {isLive ? (
        <>
          <span aria-hidden="true" className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <Wifi aria-hidden="true" className="h-3.5 w-3.5 text-success" strokeWidth={2} />
        </>
      ) : isOffline ? (
        <WifiOff
          aria-hidden="true"
          className="h-3.5 w-3.5 text-muted-foreground"
          strokeWidth={2}
        />
      ) : (
        <RefreshCw
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin text-warning motion-reduce:animate-none"
          strokeWidth={2}
        />
      )}
      <span>{LABELS[status]}</span>
    </span>
  );
}
