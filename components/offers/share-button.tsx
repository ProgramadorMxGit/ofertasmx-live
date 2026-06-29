"use client";

import { Check, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Share action for an offer (R14.1, R15.2).
 *
 * Uses the Web Share API when available (mobile + supporting desktops) and
 * gracefully falls back to copying the link to the clipboard, surfacing a brief
 * "Copiado" confirmation. Always has an accessible name (R14.7, R25.3); the
 * icon is decorative (`aria-hidden`).
 */
export interface ShareButtonProps {
  /** Absolute URL to share (the offer's public detail page). */
  url: string;
  /** Human title used by the native share sheet. */
  title: string;
  className?: string;
}

export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  const onShare = useCallback(async () => {
    // Resolve a relative href to an absolute URL so sharing/copying is portable.
    const absoluteUrl =
      url.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${url}`
        : url;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: absoluteUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(absoluteUrl);
        flashCopied();
      } catch {
        // Clipboard blocked — nothing else we can safely do.
      }
    }
  }, [flashCopied, title, url]);

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={copied ? "Enlace copiado" : `Compartir ${title}`}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border",
        "bg-surface px-3 py-2 text-meta font-medium text-foreground",
        "transition-colors duration-fast ease-emphasized hover:bg-surface-elevated",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        className,
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className="h-4 w-4 text-success" strokeWidth={2} />
      ) : (
        <Share2 aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
      )}
      <span>{copied ? "Copiado" : "Compartir"}</span>
    </button>
  );
}
