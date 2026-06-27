"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  createBrowserSupabaseClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

/**
 * Admin chrome header (Task 33.3 / R10.5, R23.1).
 *
 * The distinct admin navigation — separate from the public `Header`/`Footer`,
 * which are never rendered in the `(admin)` group. Links to the offers manager
 * and the Telegram status view, plus a sign-out action. On `/admin/login` it
 * renders nothing (the login screen has no chrome and the visitor has no
 * session yet). Sign-out clears the Supabase session via the browser client and
 * returns to the login screen; `router.refresh()` re-runs the server components
 * so the now-unauthenticated state is reflected immediately.
 */

const ADMIN_NAV: readonly { href: string; label: string }[] = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/ofertas", label: "Ofertas" },
  { href: "/admin/probar", label: "Probar" },
  { href: "/admin/telegram", label: "Telegram" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // The login screen is chrome-free.
  if (pathname === "/admin/login") return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      // Without Supabase config there is no session to clear; just return to login.
      if (isSupabaseBrowserConfigured()) {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
      }
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-sm text-body font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" strokeWidth={2} />
          <span>Admin</span>
        </Link>

        <nav aria-label="Navegación de administración" className="flex items-center gap-1">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-meta font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-focus-ring",
                isActive(pathname, item.href)
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5",
            "text-meta font-medium text-foreground outline-none transition-colors",
            "hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          {signingOut ? "Saliendo…" : "Cerrar sesión"}
        </button>
      </div>
    </header>
  );
}
