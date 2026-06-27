import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminUser } from "@/lib/admin/session";
import type { Enums, Tables } from "@/lib/supabase/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatAbsoluteDateEs } from "@/lib/utils/time";

/**
 * Admin dashboard (Task 34.2 / R23.2, R10.2).
 *
 * Server Component, rendered per request (`force-dynamic`) — never at build
 * time, so it makes no DB calls without credentials. Re-verifies the admin
 * session (defense in depth beyond `middleware.ts`) and redirects to the login
 * screen otherwise. Shows offer counts by status and the most recent admin
 * activity from `admin_audit_logs`. Reads use the authenticated (cookie) server
 * client, which RLS `is_admin()` lets see every row.
 */
export const dynamic = "force-dynamic";

type OfferStatus = Enums<"offer_status">;

const STATUS_CARDS: readonly { status: OfferStatus; label: string }[] = [
  { status: "active", label: "Activas" },
  { status: "needs_review", label: "Por revisar" },
  { status: "draft", label: "Borradores" },
  { status: "hidden", label: "Ocultas" },
  { status: "expired", label: "Expiradas" },
  { status: "rejected", label: "Rechazadas" },
];

async function countByStatus(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  status: OfferStatus,
): Promise<number> {
  const { count } = await supabase
    .from("offers")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const supabase = await createServerSupabaseClient();

  const counts = await Promise.all(
    STATUS_CARDS.map(async (card) => ({
      ...card,
      count: await countByStatus(supabase, card.status),
    })),
  );

  const { data: logs } = await supabase
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<Tables<"admin_audit_logs">[]>();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h4 font-semibold text-foreground">Panel</h1>
        <p className="text-body text-muted-foreground">Sesión: {admin.email}</p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h6 font-semibold text-foreground">Ofertas por estado</h2>
          <Link
            href="/admin/ofertas"
            className="text-meta font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Ver todas
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {counts.map((card) => (
            <div
              key={card.status}
              className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4"
            >
              <dt className="text-meta text-muted-foreground">{card.label}</dt>
              <dd className="text-h5 font-semibold tabular-nums text-foreground font-tabular">
                {card.count}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h6 font-semibold text-foreground">Herramientas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/admin/probar"
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 outline-none transition-colors hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span className="text-body font-medium text-foreground">Probar mensaje</span>
            <span className="text-meta text-muted-foreground">
              Analiza un mensaje de Telegram sin publicarlo.
            </span>
          </Link>
          <Link
            href="/admin/telegram"
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 outline-none transition-colors hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span className="text-body font-medium text-foreground">Estado del webhook</span>
            <span className="text-meta text-muted-foreground">
              Última actualización recibida y errores recientes.
            </span>
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h6 font-semibold text-foreground">Actividad reciente</h2>
        {!logs || logs.length === 0 ? (
          <p className="text-meta text-muted-foreground">Sin actividad registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-meta last:border-0 last:pb-0"
              >
                <span className="font-medium text-foreground">{log.action}</span>
                <span className="text-muted-foreground">{log.actor_email ?? "—"}</span>
                <span className="text-muted-foreground">
                  {formatAbsoluteDateEs(log.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
