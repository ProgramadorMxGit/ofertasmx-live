"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";

import "./globals.css";

/**
 * Global error boundary (Task 21.2 / R26.1, R26.2).
 *
 * Replaces the root layout when an unrecoverable error bubbles up, so it must
 * render its own <html> and <body>. Copy stays friendly and non-technical; the
 * visitor can retry (re-render the segment) or return home. We keep the
 * dark-first default and self-host no fonts here, relying on the system sans
 * fallback wired into Tailwind's `font-sans`.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" data-theme="dark">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated"
          >
            <RotateCcw className="h-8 w-8 text-primary" strokeWidth={1.75} />
          </span>
          <div className="space-y-2">
            <h1 className="font-serif text-h2 text-foreground">
              Algo salió mal
            </h1>
            <p className="mx-auto max-w-prose text-body text-muted-foreground">
              Tuvimos un problema inesperado. Puedes reintentar o volver al
              inicio; las ofertas siguen ahí.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 py-2.5 text-body font-medium text-primary-foreground transition-colors duration-fast ease-emphasized hover:opacity-90 focus-visible:outline-none"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-5 py-2.5 text-body font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none"
            >
              Ir al inicio
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
