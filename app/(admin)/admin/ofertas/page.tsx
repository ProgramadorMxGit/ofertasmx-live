import { redirect } from "next/navigation";

import { AdminTable } from "@/components/admin";
import { getAdminUser } from "@/lib/admin/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

/**
 * Admin offers list (Task 34.2 / R23.2, R10.2).
 *
 * Server Component (`force-dynamic`) that re-verifies the admin session, then
 * reads offers through the authenticated (cookie) client — RLS `is_admin()`
 * returns **all** rows (not only `active`). A generous, bounded page (most
 * recent first) is handed to the client {@link AdminTable}, which owns search
 * and the status/platform/needs-review filters and the quick actions.
 */
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

export default async function AdminOffersPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS)
    .returns<Tables<"offers">[]>();

  const offers = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h4 font-semibold text-foreground">Ofertas</h1>
        <p className="text-body text-muted-foreground">
          Gestiona, edita y publica las ofertas detectadas.
        </p>
      </header>
      <AdminTable offers={offers} />
    </div>
  );
}
