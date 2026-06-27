import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Skeleton placeholder with a premium shimmer (R26.1).
 *
 * The shimmer sweeps a soft highlight across the block using a transform-only
 * animation (R18.2). Under `prefers-reduced-motion: reduce` the moving sheen is
 * hidden (`motion-reduce:hidden`) and the global reduced-motion rule also stops
 * any residual animation, leaving a calm static placeholder (R18.5). The block
 * is decorative, so it is hidden from assistive tech; surrounding regions own
 * the loading announcement.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        className,
      )}
      {...props}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent motion-reduce:hidden" />
    </div>
  );
}
