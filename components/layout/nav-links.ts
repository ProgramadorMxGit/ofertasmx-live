/**
 * Public navigation model (R13.2), shared by `Header` and `MobileNav` so the
 * desktop bar and the mobile drawer never drift apart. Pure data — no React,
 * no `"use client"` — importable from either Server or Client Components.
 */
export interface NavLink {
  readonly href: string;
  readonly label: string;
}

/** The five public nav entries required by R13.2, in display order. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/ofertas", label: "Ofertas" },
  { href: "/amazon", label: "Amazon" },
  { href: "/mercado-libre", label: "Mercado Libre" },
  { href: "/categorias", label: "Categorías" },
  { href: "/como-funciona", label: "Cómo funciona" },
];
