import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_ICON: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export interface StatusBlockProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional affordance (e.g. a retry button) supplied by the consumer. */
  action?: ReactNode;
  tone?: StatusTone;
  /** `status` (polite) by default; use `alert` for genuine error states. */
  role?: "status" | "alert";
  /** Tighter spacing for inline placements. */
  compact?: boolean;
  /** Extra classes for the icon (e.g. `animate-spin` for a retrying state). */
  iconClassName?: string;
  className?: string;
}

/**
 * Shared presentational shell for empty / error / informational UI states
 * (R26.1, R26.2). Presentational only (no client hooks or handlers), so it
 * works inside Server Components; interactivity is passed in via `action`.
 *
 * Information is never conveyed by color alone — every state pairs an icon with
 * a clear text title and friendly, non-technical Spanish copy (R25.5, R26.2).
 */
export function StatusBlock({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  role = "status",
  compact = false,
  iconClassName,
  className,
}: StatusBlockProps) {
  return (
    <div
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-surface-elevated",
          compact ? "h-10 w-10" : "h-14 w-14",
        )}
      >
        <Icon
          className={cn(
            compact ? "h-5 w-5" : "h-7 w-7",
            TONE_ICON[tone],
            iconClassName,
          )}
          strokeWidth={1.75}
        />
      </span>
      <div className={cn("space-y-1", compact && "space-y-0.5")}>
        <p
          className={cn(
            "font-medium text-foreground",
            compact ? "text-body" : "text-h6",
          )}
        >
          {title}
        </p>
        {description ? (
          <p className="mx-auto max-w-prose text-body text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
