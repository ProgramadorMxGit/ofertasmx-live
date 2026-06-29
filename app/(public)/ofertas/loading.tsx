import { Skeleton } from "@/components/ui/states";

/**
 * Route-level loading UI for `/ofertas` (R13.7, R26.1).
 *
 * Shown by the App Router during the initial load and while a filter/sort
 * change re-fetches the SSR page. Mirrors the page silhouette — heading, a
 * toolbar row and a card grid — with calm, transform-only shimmer placeholders
 * (reduced-motion safe). Decorative, so it is hidden from assistive tech; the
 * surrounding navigation owns the loading announcement.
 */
const SKELETON_CARDS = 8;

export default function OfertasLoading() {
  return (
    <section
      aria-hidden="true"
      className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6"
    >
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-prose" />
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
          <li
            key={index}
            className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface"
          >
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-control)]" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
