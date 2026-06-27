"use client";

import { Eye, EyeOff, Star, TimerOff, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { Enums, Tables } from "@/lib/supabase/types";
import { cn } from "@/lib/utils/cn";
import { formatMXN } from "@/lib/utils/money";

import { postAdminAction, type AdminActionBody } from "./admin-api";

/**
 * `AdminTable` — the offers management table (Task 34.2 / R23.2).
 *
 * A Client Component that receives every offer (read server-side through the
 * authenticated client, which RLS `is_admin()` lets see all rows) and provides
 * client-side **search** (title/slug) and **filters** (status, platform,
 * needs-review). Each row has quick actions — publish, hide, expire and toggle
 * featured — that POST to `/api/admin/offers`; on success it calls
 * `router.refresh()` so the server re-reads the updated data. A row links to its
 * full editor at `/admin/ofertas/[id]`.
 */

type OfferRow = Tables<"offers">;
type OfferStatus = Enums<"offer_status">;
type Platform = Enums<"platform_t">;

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  expired: "Expirada",
  hidden: "Oculta",
  rejected: "Rechazada",
  needs_review: "Revisar",
};

const STATUS_TONE: Record<OfferStatus, string> = {
  draft: "text-muted-foreground",
  active: "text-success",
  expired: "text-warning",
  hidden: "text-muted-foreground",
  rejected: "text-danger",
  needs_review: "text-warning",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

const STATUS_FILTERS: readonly (OfferStatus | "all")[] = [
  "all",
  "active",
  "needs_review",
  "draft",
  "hidden",
  "expired",
  "rejected",
];

export interface AdminTableProps {
  offers: readonly OfferRow[];
}

export function AdminTable({ offers }: AdminTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return offers.filter((offer) => {
      if (statusFilter !== "all" && offer.status !== statusFilter) return false;
      if (platformFilter !== "all" && offer.platform !== platformFilter) return false;
      if (needsReviewOnly && !offer.needs_review) return false;
      if (needle !== "") {
        const haystack = `${offer.title} ${offer.slug}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [offers, search, statusFilter, platformFilter, needsReviewOnly]);

  const runAction = (body: AdminActionBody) => {
    setBusyId(body.offerId);
    setError(null);
    void postAdminAction(body).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      startTransition(() => router.refresh());
    });
  };

  const selectClass = cn(
    "rounded-lg border border-border bg-background px-3 py-2 text-meta text-foreground",
    "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
  );

  return (
    <section className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="admin-search" className="text-meta font-medium text-muted-foreground">
            Buscar
          </label>
          <input
            id="admin-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Título o slug…"
            className={cn(
              "w-full rounded-lg border border-border bg-background px-3 py-2 text-meta text-foreground",
              "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring placeholder:text-muted-foreground",
            )}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="admin-status" className="text-meta font-medium text-muted-foreground">
            Estado
          </label>
          <select
            id="admin-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as OfferStatus | "all")}
            className={selectClass}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "Todos" : STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="admin-platform" className="text-meta font-medium text-muted-foreground">
            Plataforma
          </label>
          <select
            id="admin-platform"
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value as Platform | "all")}
            className={selectClass}
          >
            <option value="all">Todas</option>
            <option value="amazon">Amazon</option>
            <option value="mercado_libre">Mercado Libre</option>
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 text-meta text-foreground">
          <input
            type="checkbox"
            checked={needsReviewOnly}
            onChange={(event) => setNeedsReviewOnly(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          Solo por revisar
        </label>
      </div>

      <p className="text-meta text-muted-foreground" aria-live="polite">
        {filtered.length} de {offers.length} ofertas
      </p>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-meta text-danger">
          {error}
        </p>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <caption className="sr-only">Ofertas administrables con acciones de gestión</caption>
          <thead className="bg-surface-elevated text-meta text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Oferta</th>
              <th scope="col" className="px-3 py-2 font-medium">Plataforma</th>
              <th scope="col" className="px-3 py-2 font-medium">Estado</th>
              <th scope="col" className="px-3 py-2 font-medium">Precio</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-meta text-muted-foreground">
                  No hay ofertas que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtered.map((offer) => {
                const busy = busyId === offer.id || isPending;
                return (
                  <tr key={offer.id} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/ofertas/${offer.id}`}
                        className="line-clamp-2 max-w-[22rem] text-body font-medium text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        {offer.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-meta text-muted-foreground">
                        <span className="truncate">/{offer.slug}</span>
                        {offer.is_featured ? (
                          <span className="inline-flex items-center gap-0.5 text-primary">
                            <Star aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                            Destacada
                          </span>
                        ) : null}
                        {offer.needs_review ? (
                          <span className="text-warning">Por revisar</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-meta text-foreground">
                      {PLATFORM_LABEL[offer.platform]}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("text-meta font-medium", STATUS_TONE[offer.status])}>
                        {STATUS_LABEL[offer.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-meta tabular-nums text-foreground font-tabular">
                      {formatMXN(offer.current_price)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <ActionButton
                          icon={Eye}
                          label="Publicar"
                          disabled={busy || offer.status === "active"}
                          onClick={() => runAction({ action: "publish", offerId: offer.id })}
                        />
                        <ActionButton
                          icon={EyeOff}
                          label="Ocultar"
                          disabled={busy || offer.status === "hidden"}
                          onClick={() => runAction({ action: "hide", offerId: offer.id })}
                        />
                        <ActionButton
                          icon={TimerOff}
                          label="Expirar"
                          disabled={busy || offer.status === "expired"}
                          onClick={() => runAction({ action: "expire", offerId: offer.id })}
                        />
                        <ActionButton
                          icon={Star}
                          label={offer.is_featured ? "Quitar destacado" : "Destacar"}
                          active={offer.is_featured}
                          disabled={busy}
                          onClick={() =>
                            runAction({
                              action: "feature",
                              offerId: offer.id,
                              value: !offer.is_featured,
                            })
                          }
                        />
                        <ActionButton
                          icon={Upload}
                          label="Reintentar imagen"
                          disabled={busy || offer.image_status === "pending"}
                          onClick={() => runAction({ action: "retry_image", offerId: offer.id })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ActionButtonProps {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function ActionButton({ icon: Icon, label, onClick, disabled, active }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border outline-none transition-colors",
        "hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? "text-primary" : "text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
