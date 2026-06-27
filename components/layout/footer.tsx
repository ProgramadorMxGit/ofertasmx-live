import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import type { NavLink } from "./nav-links";

/**
 * `Footer` — public-page links + honest affiliate note (Task 25.2 / R13.11, R21.1).
 *
 * A Server Component. It links to every public page (R13.11) in two mobile-first
 * columns that stack on small screens and never overflow horizontally (R17.1,
 * R17.3), and carries a brief, truthful affiliate disclosure (R21.1) pointing to
 * the full transparency page — no invented figures or urgency.
 */
const EXPLORE_LINKS: readonly NavLink[] = [
  { href: "/ofertas", label: "Ofertas" },
  { href: "/amazon", label: "Amazon" },
  { href: "/mercado-libre", label: "Mercado Libre" },
  { href: "/como-funciona", label: "Cómo funciona" },
];

const INFO_LINKS: readonly NavLink[] = [
  { href: "/transparencia-afiliados", label: "Transparencia de afiliados" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
  { href: "/contacto", label: "Contacto" },
];

const LINK_CLASS =
  "inline-block rounded-sm text-meta text-muted-foreground transition-colors duration-fast ease-emphasized hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

function LinkColumn({
  heading,
  links,
}: {
  heading: string;
  links: readonly NavLink[];
}) {
  return (
    <nav aria-label={heading} className="min-w-0">
      <h2 className="mb-3 text-meta font-semibold uppercase tracking-wide text-foreground">
        {heading}
      </h2>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={LINK_CLASS}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={cn("w-full border-t border-border bg-surface/40", className)}>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {/* Brand + honest affiliate note */}
        <div className="min-w-0 sm:col-span-2 lg:col-span-2">
          <Link
            href="/"
            aria-label="Ofertas Reales IA, ir al inicio"
            className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Image src="/mark.svg" alt="" width={30} height={30} className="h-7 w-7" />
            <span className="text-body font-semibold tracking-tight text-foreground">
              Ofertas Reales <span className="text-primary">IA</span>
            </span>
          </Link>
          <p className="mt-4 max-w-prose text-meta leading-relaxed text-muted-foreground">
            Ofertas reales en tiempo casi real de Amazon México y Mercado Libre.
            Usamos enlaces de afiliado: el precio para ti no cambia y podemos
            ganar una comisión por compras elegibles.
          </p>
          <Link
            href="/transparencia-afiliados"
            className="mt-3 inline-block rounded-sm text-meta font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Cómo funcionan los enlaces de afiliado
          </Link>
        </div>

        <LinkColumn heading="Explorar" links={EXPLORE_LINKS} />
        <LinkColumn heading="Información" links={INFO_LINKS} />
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-meta text-muted-foreground sm:px-6">
          <p>© {year} Ofertas Reales IA. Todos los derechos reservados.</p>
          <p>
            No somos Amazon ni Mercado Libre. Los precios y la disponibilidad
            pueden cambiar en cada comercio.
          </p>
        </div>
      </div>
    </footer>
  );
}
