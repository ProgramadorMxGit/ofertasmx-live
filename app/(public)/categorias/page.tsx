import {
  Briefcase,
  Dumbbell,
  Home,
  Shirt,
  Smartphone,
  Sparkles,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { OFFER_CATEGORIES } from "@/lib/offers/categories";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/**
 * `/categorias` — the category index (Task 28.1, R10.1).
 *
 * A static Server Component: a responsive grid of the eight known categories
 * (the single source of truth in `lib/offers/categories`), each linking to its
 * `/categorias/[slug]` listing. This is the destination of the "Categorías" nav
 * entry, which previously 404'd. Static content needs no DB and no
 * `force-dynamic`.
 */
export const metadata: Metadata = {
  title: "Categorías",
  description:
    "Explora las ofertas reales de Amazon México y Mercado Libre por categoría: electrónica, hogar, moda, herramientas, oficina, belleza, deportes y más.",
  alternates: { canonical: "/categorias" },
};

/** Slug → icon. Decorative only; falls back to a generic tag for safety. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  electronica: Smartphone,
  hogar: Home,
  moda: Shirt,
  herramientas: Wrench,
  oficina: Briefcase,
  belleza: Sparkles,
  deportes: Dumbbell,
  otros: Tag,
};

export default function CategoriasPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Categorías", path: "/categorias" },
        ])}
      />
      <header className="mb-8">
        <h1 className="font-serif text-h2 tracking-tight text-foreground">
          Categorías
        </h1>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Encuentra ofertas por tipo de producto. Reunimos ofertas de Amazon
          México y Mercado Libre; los precios y la disponibilidad pueden cambiar
          en cada tienda sin previo aviso.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {OFFER_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.slug] ?? Tag;
          return (
            <li key={category.slug}>
              <Link
                href={`/categorias/${category.slug}`}
                className="group flex h-full flex-col items-start gap-3 rounded-[var(--radius)] border border-border bg-surface p-5 transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-primary transition-colors duration-fast ease-emphasized group-hover:bg-primary/10">
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-h6 font-semibold text-foreground">
                  {category.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
