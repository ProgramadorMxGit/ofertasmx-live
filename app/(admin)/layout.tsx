import type { ReactNode } from "react";

import { AdminHeader } from "@/components/admin/admin-header";

/**
 * Admin route-group layout (Task 33.3 / R10.5, R23.1).
 *
 * Wraps every `(admin)` route with the distinct admin chrome — its own
 * {@link AdminHeader} — and deliberately renders **no** public `Header`/`Footer`
 * (the admin area is separate from, and unlinked by, the public site, R10.5).
 * The header hides itself on `/admin/login` so the login screen stays
 * chrome-free. Access is enforced upstream by `middleware.ts` and re-checked in
 * each page via the server guard (`getAdminUser`), so this layout is purely
 * structural.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AdminHeader />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
