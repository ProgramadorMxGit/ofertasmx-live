"use client";

import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useFocusTrap } from "@/lib/ui/use-focus-trap";
import { cn } from "@/lib/utils/cn";

import { NAV_LINKS } from "./nav-links";

/**
 * `MobileNav` — accessible navigation drawer (Task 25.1 / R13.3, R17.2, R25.4).
 *
 * A Client Component. The slide-in panel is a focus-trapped modal dialog: focus
 * moves inside on open, Tab cycles within it, Escape closes it and focus is
 * restored on close (via {@link useFocusTrap}). Targets are ≥44px and nothing
 * depends on hover (R17.2). Background scroll is locked while open. The header
 * shows this drawer instead of a redundant bottom bar, satisfying R17.4/R17.5.
 */
export interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  /** WhatsApp group invite URL (`NEXT_PUBLIC_WHATSAPP_INVITE_URL`). */
  whatsappUrl: string;
}

export function MobileNav({ open, onClose, whatsappUrl }: MobileNavProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, onClose);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full w-[86%] max-w-xs flex-col border-l border-border bg-surface shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-body font-semibold text-foreground">Menú</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
          {NAV_LINKS.map((link) => {
            const active =
              !!pathname &&
              (pathname === link.href || pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] items-center rounded-xl px-4 text-body font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                  active
                    ? "bg-surface-elevated text-foreground"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border p-4">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-body font-semibold text-primary-foreground transition-colors duration-fast ease-emphasized hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <MessageCircle aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
            Unirme al grupo
          </a>
        </div>
      </div>
    </div>
  );
}
