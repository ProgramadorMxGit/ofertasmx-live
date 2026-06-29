"use client";

import { Menu, MessageCircle, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { SearchCommand } from "@/components/offers/search-command";
import { publicEnv } from "@/lib/env";
import type { PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";

import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

/**
 * `Header` — sticky site chrome (Task 25.1 / R13.1, R13.2, R17).
 *
 * A Client Component because it owns scroll state and the mobile drawer. It
 * starts transparent and, once scrolled, transitions to a semi-transparent dark
 * surface with moderate blur, a thin bottom border, a subtle shadow and a
 * slightly reduced height (R13.1) — animating only color/opacity/height, with
 * the scroll listener throttled via `requestAnimationFrame` (R18.3). It holds
 * the nav, a WhatsApp CTA, the theme toggle and a search trigger (R13.2). On
 * mobile the nav collapses into an accessible drawer (`MobileNav`) opened from a
 * ≥44px hamburger; there is no redundant bottom bar (R17.4, R17.5).
 *
 * `searchOffers` (optional) is the dataset the desktop `SearchCommand` searches;
 * when omitted the search trigger links to `/ofertas`. The component compiles
 * and is exported here but is mounted into pages in Task 26.
 */
export interface HeaderProps {
  /** Dataset for the desktop command-palette search; omit to link to /ofertas. */
  searchOffers?: PublicOffer[];
}

/** Scroll distance (px) past which the header switches to its solid surface. */
const SCROLL_THRESHOLD = 8;

export function Header({ searchOffers }: HeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const whatsappUrl = publicEnv.NEXT_PUBLIC_WHATSAPP_INVITE_URL;
  const hasSearch = Boolean(searchOffers && searchOffers.length > 0);

  // Throttle scroll handling with rAF; animate only opacity/transform-ish props.
  useEffect(() => {
    let frame = 0;
    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b",
        "transition-[background-color,border-color,box-shadow,height] duration-normal ease-emphasized",
        scrolled
          ? "border-border bg-surface/80 shadow-sm backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6",
          "transition-[height] duration-normal ease-emphasized",
          scrolled ? "h-14" : "h-16",
        )}
      >
        {/* Brand: abstract pulse mark + wordmark (R12.1). */}
        <Link
          href="/"
          aria-label="Ofertas Reales IA, ir al inicio"
          className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Image src="/mark.svg" alt="" width={30} height={30} className="h-7 w-7" priority />
          <span className="hidden text-body font-semibold tracking-tight text-foreground sm:inline">
            Ofertas Reales <span className="text-primary">IA</span>
          </span>
        </Link>

        {/* Desktop navigation (R13.2). */}
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active =
              !!pathname &&
              (pathname === link.href || pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-meta font-medium transition-colors duration-fast ease-emphasized",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster: search, theme, WhatsApp CTA, mobile menu. */}
        <div className="flex shrink-0 items-center gap-2">
          {hasSearch && searchOffers ? (
            <SearchCommand offers={searchOffers} className="hidden md:inline-flex" />
          ) : (
            <Link
              href="/ofertas"
              aria-label="Buscar ofertas"
              className="hidden items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-meta text-muted-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:inline-flex"
            >
              <Search aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              <span>Buscar</span>
            </Link>
          )}

          {/* Compact mobile search affordance (avoids horizontal overflow, R17.3). */}
          <Link
            href="/ofertas"
            aria-label="Buscar ofertas"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
          >
            <Search aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          </Link>

          <ThemeToggle />

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 py-2 text-meta font-semibold text-primary-foreground transition-colors duration-fast ease-emphasized hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:inline-flex"
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            Unirme al grupo
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <MobileNav open={menuOpen} onClose={closeMenu} whatsappUrl={whatsappUrl} />
    </header>
  );
}
