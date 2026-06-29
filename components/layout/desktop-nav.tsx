"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { transition } from "@/lib/ui/motion";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";
import { cn } from "@/lib/utils/cn";

import { NAV_LINKS } from "./nav-links";

/**
 * `DesktopNav` — primary horizontal navigation with a sliding "pill" highlight.
 *
 * The pill sits behind the hovered item (or the active route when nothing is
 * hovered) and slides between items via a framer-motion shared-layout animation
 * (`layoutId`), which animates with transforms only (R18.2). Motion is the
 * sanctioned tool for UI highlights here (design-system "resaltados").
 *
 * Reduced motion (R18.5): hover-tracking and the slide are dropped — a static
 * pill marks the active route only, preserving the affordance with zero motion
 * and full functionality. First paint is deterministic (active route from
 * `usePathname`, no hover), so there is no hydration mismatch.
 */
export function DesktopNav() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  const activeHref = NAV_LINKS.find(
    (link) =>
      pathname === link.href || (!!pathname && pathname.startsWith(`${link.href}/`)),
  )?.href;

  // With motion the pill follows hover and falls back to the active route; under
  // reduced motion we never track the pointer and only mark the active route.
  const highlighted = reducedMotion
    ? activeHref ?? null
    : hovered ?? activeHref ?? null;

  return (
    <nav
      aria-label="Principal"
      className="relative hidden items-center gap-1 md:flex"
      onMouseLeave={reducedMotion ? undefined : () => setHovered(null)}
    >
      {NAV_LINKS.map((link) => {
        const active = activeHref === link.href;
        const isHighlighted = highlighted === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            onMouseEnter={reducedMotion ? undefined : () => setHovered(link.href)}
            onFocus={reducedMotion ? undefined : () => setHovered(link.href)}
            onBlur={reducedMotion ? undefined : () => setHovered(null)}
            className={cn(
              "relative whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-meta font-medium",
              "transition-colors duration-fast ease-emphasized",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              isHighlighted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isHighlighted ? (
              reducedMotion ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[var(--radius-control)] bg-surface-elevated"
                />
              ) : (
                <motion.span
                  layoutId="desktop-nav-pill"
                  aria-hidden="true"
                  className="absolute inset-0 bg-surface-elevated"
                  // Numeric radius (mirrors --radius-control: 8px) so Motion can
                  // correct the rounded corners while the layout animation runs.
                  style={{ borderRadius: 8 }}
                  transition={transition("fast")}
                />
              )
            ) : null}
            <span className="relative">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
