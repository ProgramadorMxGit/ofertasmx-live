import { Compass } from "lucide-react";
import Link from "next/link";

/**
 * 404 page (Task 21.2 / R26.1, R26.2).
 * Friendly, non-technical copy with a clear path back to the offers. Rendered
 * inside the root layout, so it inherits the theme, fonts and brand chrome.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated"
      >
        <Compass className="h-8 w-8 text-primary" strokeWidth={1.75} />
      </span>
      <div className="space-y-2">
        <p className="text-meta font-medium uppercase tracking-wide text-primary">
          Error 404
        </p>
        <h1 className="font-serif text-h2 text-foreground">
          No encontramos esta página
        </h1>
        <p className="mx-auto max-w-prose text-body text-muted-foreground">
          La página que buscas no existe o cambió de lugar. Desde el inicio
          puedes seguir explorando las ofertas en vivo.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-foreground transition-colors duration-fast ease-emphasized hover:opacity-90 focus-visible:outline-none"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
