import type { ReactNode } from "react";

import { Footer, Header } from "@/components/layout";

/**
 * Public route-group layout (Task 26 / R13.1, R13.11, R25.1).
 *
 * A Server Component that wraps every public page with the sticky `Header`, the
 * main landmark and the `Footer`. The first focusable element is a skip link
 * that jumps to `#contenido` (R25.1), visually hidden until focused so keyboard
 * users can bypass the nav. The route group `(public)` adds no path segment, so
 * `app/(public)/page.tsx` is the site root `/`.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only rounded-lg bg-primary px-4 py-2 text-body font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Saltar al contenido
      </a>
      <Header />
      {/* `tabIndex={-1}` makes the skip-link target programmatically focusable
          so activating "Saltar al contenido" actually moves keyboard focus here
          (R25.1); `focus:outline-none` avoids an outline on this non-interactive
          container (programmatic focus does not trigger `:focus-visible`). */}
      <main id="contenido" tabIndex={-1} className="min-h-screen focus:outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}
