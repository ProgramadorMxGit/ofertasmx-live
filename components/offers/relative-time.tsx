"use client";

import { useEffect, useState } from "react";

import { formatAbsoluteDateEs, formatRelativeTimeEs } from "@/lib/utils/time";

/**
 * Renders a timestamp as a friendly Spanish relative time ("hace X min", R22.1)
 * inside a semantic `<time>` element.
 *
 * To avoid a hydration mismatch (relative time depends on "now", which differs
 * between server render and client hydration), first paint shows a
 * deterministic, locale-independent absolute date — identical on server and
 * client — and the component swaps to the relative form only after mount,
 * refreshing it every minute. The machine-readable value always lives in the
 * `dateTime` attribute.
 */
export interface RelativeTimeProps {
  /** ISO 8601 timestamp. */
  iso: string;
  /** Optional prefix, e.g. "Verificada ". */
  prefix?: string;
  className?: string;
}

export function RelativeTime({ iso, prefix, className }: RelativeTimeProps) {
  // Deterministic first-paint value (no "now"), so SSR and hydration match.
  const [label, setLabel] = useState(() => formatAbsoluteDateEs(iso));

  useEffect(() => {
    const update = (): void => setLabel(formatRelativeTimeEs(iso));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [iso]);

  if (label === "") return null;

  return (
    <time dateTime={iso} className={className}>
      {prefix}
      {label}
    </time>
  );
}
