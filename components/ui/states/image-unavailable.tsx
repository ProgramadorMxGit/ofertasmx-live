import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Placeholder shown when a product image cannot be displayed (R26.1).
 *
 * Designed to fill its container (an offer card's image box), so it keeps the
 * layout stable and avoids shift. It exposes a non-technical accessible label
 * instead of a broken image, and conveys meaning with both an icon and text
 * (R25.5).
 */
export function ImageUnavailable({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Imagen no disponible"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/50 p-4 text-center",
        className,
      )}
    >
      <ImageOff
        aria-hidden="true"
        className="h-7 w-7 text-muted-foreground"
        strokeWidth={1.75}
      />
      <span className="text-meta text-muted-foreground">
        Imagen no disponible
      </span>
    </div>
  );
}
