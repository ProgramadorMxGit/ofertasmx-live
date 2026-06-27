"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Star,
  TimerOff,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type ReactNode, useMemo, useState, useTransition } from "react";

import { OfferCard } from "@/components/offers/offer-card";
import type { OfferCategory } from "@/lib/offers/categories";
import type { PublicOffer } from "@/lib/offers/query";
import type { Enums, Json, Tables } from "@/lib/supabase/types";
import { cn } from "@/lib/utils/cn";
import { formatMXN } from "@/lib/utils/money";
import { formatAbsoluteDateEs } from "@/lib/utils/time";

import { postAdminAction, type AdminActionBody, type AdminEditFields } from "./admin-api";

/**
 * `AdminOfferEditor` — full single-offer editor (Task 34.2 / R23.3, R23.4,
 * R23.5, R4.15).
 *
 * A Client Component that lets an admin correct the title, category, image alt
 * and editorial fields (R4.15, R23.3); change status (publish/hide/expire),
 * toggle featured and retry the image (R23.2); and review everything needed to
 * judge an offer (R23.3, R23.4): the parser-derived fields, the raw Telegram
 * text, processing/needs-review signals, the affiliate link with a tracking-id
 * check, a live card preview (reusing {@link OfferCard}), a link to the public
 * page, and the change history from `admin_audit_logs` (R23.5). All writes go
 * through `/api/admin/offers`, which re-verifies the admin session and audits
 * every action.
 */

type OfferRow = Tables<"offers">;
type OfferStatus = Enums<"offer_status">;

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  expired: "Expirada",
  hidden: "Oculta",
  rejected: "Rechazada",
  needs_review: "Por revisar",
};

const PLATFORM_LABEL: Record<Enums<"platform_t">, string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

export interface AdminOfferEditorProps {
  offer: OfferRow;
  auditLogs: readonly Tables<"admin_audit_logs">[];
  categories: readonly OfferCategory[];
  currentCategorySlug: string | null;
  /** Amazon tag check (null for non-Amazon or when there is no affiliate URL). */
  tagCheck: { tag: string | null; needsReview: boolean; expected: string } | null;
  showAmazonPrices: boolean;
}

/** Normalize an optional text field: trimmed, or `null` when empty. */
function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function AdminOfferEditor({
  offer,
  auditLogs,
  categories,
  currentCategorySlug,
  tagCheck,
  showAmazonPrices,
}: AdminOfferEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(offer.title);
  const [categorySlug, setCategorySlug] = useState(currentCategorySlug ?? "");
  const [imageAlt, setImageAlt] = useState(offer.image_alt ?? "");
  const [editorialSummary, setEditorialSummary] = useState(offer.editorial_summary ?? "");
  const [shortDescription, setShortDescription] = useState(offer.short_description ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Live preview reflects the in-progress edits.
  const previewOffer: PublicOffer = useMemo(
    () => ({
      id: offer.id,
      platform: offer.platform,
      merchant: offer.merchant,
      external_product_id: offer.external_product_id,
      title: title.trim() === "" ? offer.title : title,
      slug: offer.slug,
      short_description: toNullable(shortDescription),
      editorial_summary: toNullable(editorialSummary),
      image_url: offer.image_url,
      image_alt: toNullable(imageAlt),
      image_status: offer.image_status,
      original_price: offer.original_price,
      current_price: offer.current_price,
      discount_percent: offer.discount_percent,
      currency: offer.currency,
      affiliate_url: offer.affiliate_url,
      category_id: offer.category_id,
      status: offer.status,
      is_featured: offer.is_featured,
      published_at: offer.published_at,
      updated_at: offer.updated_at,
      last_verified_at: offer.last_verified_at,
      expires_at: offer.expires_at,
      created_at: offer.created_at,
    }),
    [offer, title, shortDescription, editorialSummary, imageAlt],
  );

  const runAction = (body: AdminActionBody, successMessage: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void postAdminAction(body).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(successMessage);
      startTransition(() => router.refresh());
    });
  };

  const buildEditFields = (): AdminEditFields | null => {
    const fields: AdminEditFields = {};
    if (title.trim() !== "" && title !== offer.title) fields.title = title.trim();
    if (categorySlug !== "" && categorySlug !== currentCategorySlug) {
      fields.categorySlug = categorySlug;
    }
    if (toNullable(imageAlt) !== offer.image_alt) fields.image_alt = toNullable(imageAlt);
    if (toNullable(editorialSummary) !== offer.editorial_summary) {
      fields.editorial_summary = toNullable(editorialSummary);
    }
    if (toNullable(shortDescription) !== offer.short_description) {
      fields.short_description = toNullable(shortDescription);
    }
    return Object.keys(fields).length > 0 ? fields : null;
  };

  const handleSave = () => {
    const fields = buildEditFields();
    if (!fields) {
      setNotice("No hay cambios por guardar.");
      setError(null);
      return;
    }
    runAction({ action: "edit", offerId: offer.id, fields }, "Cambios guardados.");
  };

  const detailHref = `/ofertas/${offer.slug}`;
  const disabled = busy || isPending;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h5 font-semibold text-foreground">Editar oferta</h1>
          <p className="text-meta text-muted-foreground">
            {PLATFORM_LABEL[offer.platform]} · {STATUS_LABEL[offer.status]}
          </p>
        </div>
        <Link
          href={detailHref}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-meta font-medium text-foreground outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Ver página
          <ExternalLink aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      </div>

      {/* Feedback */}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-meta text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-meta text-success">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column: edit form + actions + raw data */}
        <div className="flex flex-col gap-6">
          {/* Edit form */}
          <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-h6 font-semibold text-foreground">Contenido</h2>

            <Field label="Título" htmlFor="edit-title">
              <input
                id="edit-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Categoría" htmlFor="edit-category">
              <select
                id="edit-category"
                value={categorySlug}
                onChange={(event) => setCategorySlug(event.target.value)}
                className={inputClass}
              >
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Texto alternativo de la imagen" htmlFor="edit-alt">
              <input
                id="edit-alt"
                type="text"
                value={imageAlt}
                onChange={(event) => setImageAlt(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Resumen editorial" htmlFor="edit-summary">
              <textarea
                id="edit-summary"
                rows={3}
                value={editorialSummary}
                onChange={(event) => setEditorialSummary(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Descripción corta" htmlFor="edit-short">
              <textarea
                id="edit-short"
                rows={2}
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                className={inputClass}
              />
            </Field>

            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground",
                  "outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus-ring",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {disabled ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </section>

          {/* Status & actions */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-h6 font-semibold text-foreground">Acciones</h2>
            <div className="flex flex-wrap gap-2">
              <ActionPill
                icon={Eye}
                label="Publicar"
                disabled={disabled || offer.status === "active"}
                onClick={() =>
                  runAction({ action: "publish", offerId: offer.id }, "Oferta publicada.")
                }
              />
              <ActionPill
                icon={EyeOff}
                label="Ocultar"
                disabled={disabled || offer.status === "hidden"}
                onClick={() => runAction({ action: "hide", offerId: offer.id }, "Oferta oculta.")}
              />
              <ActionPill
                icon={TimerOff}
                label="Expirar"
                disabled={disabled || offer.status === "expired"}
                onClick={() =>
                  runAction({ action: "expire", offerId: offer.id }, "Oferta expirada.")
                }
              />
              <ActionPill
                icon={Star}
                label={offer.is_featured ? "Quitar destacado" : "Destacar"}
                active={offer.is_featured}
                disabled={disabled}
                onClick={() =>
                  runAction(
                    { action: "feature", offerId: offer.id, value: !offer.is_featured },
                    offer.is_featured ? "Destacado retirado." : "Oferta destacada.",
                  )
                }
              />
              <ActionPill
                icon={Upload}
                label="Reintentar imagen"
                disabled={disabled || offer.image_status === "pending"}
                onClick={() =>
                  runAction(
                    { action: "retry_image", offerId: offer.id },
                    "Reintento de imagen programado.",
                  )
                }
              />
            </div>
          </section>

          {/* Parser-derived fields */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-h6 font-semibold text-foreground">Datos del parser</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-meta">
              <DataPair label="Plataforma" value={PLATFORM_LABEL[offer.platform]} />
              <DataPair label="Comercio" value={offer.merchant} />
              <DataPair label="ID externo" value={offer.external_product_id ?? "—"} />
              <DataPair label="Precio actual" value={formatMXN(offer.current_price)} />
              <DataPair
                label="Precio original"
                value={offer.original_price !== null ? formatMXN(offer.original_price) : "—"}
              />
              <DataPair
                label="Descuento"
                value={offer.discount_percent !== null ? `${offer.discount_percent}%` : "—"}
              />
              <DataPair label="Estado de imagen" value={offer.image_status} />
              <DataPair label="Reintentos de imagen" value={String(offer.image_retry_count)} />
            </dl>

            {/* Processing signals / errors */}
            {(offer.needs_review || offer.image_status === "failed") ? (
              <div className="flex flex-col gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-meta text-warning">
                {offer.needs_review ? (
                  <p className="flex items-center gap-1.5">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                    Marcada para revisión por el parser.
                  </p>
                ) : null}
                {offer.image_status === "failed" ? (
                  <p className="flex items-center gap-1.5">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                    La imagen no se pudo procesar. Usa &quot;Reintentar imagen&quot;.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Affiliate link + tracking-id check */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-h6 font-semibold text-foreground">Enlace de afiliado</h2>
            {offer.affiliate_url ? (
              <a
                href={offer.affiliate_url}
                target="_blank"
                rel="nofollow noopener"
                className="break-all text-meta text-primary underline-offset-2 hover:underline"
              >
                {offer.affiliate_url}
              </a>
            ) : (
              <p className="text-meta text-muted-foreground">Sin enlace de afiliado.</p>
            )}

            {tagCheck ? (
              tagCheck.needsReview ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-meta text-warning">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                  El tag de afiliado ({tagCheck.tag ?? "ausente"}) no coincide con el esperado (
                  {tagCheck.expected}).
                </p>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-meta text-success">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                  Tag de afiliado verificado ({tagCheck.expected}).
                </p>
              )
            ) : null}
          </section>

          {/* Raw text */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-h6 font-semibold text-foreground">Texto original</h2>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-meta text-muted-foreground">
              {offer.raw_text ?? "—"}
            </pre>
          </section>
        </div>

        {/* Right column: preview + history */}
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="text-h6 font-semibold text-foreground">Vista previa</h2>
            <OfferCard offer={previewOffer} showAmazonPrices={showAmazonPrices} />
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-h6 font-semibold text-foreground">Historial de cambios</h2>
            {auditLogs.length === 0 ? (
              <p className="text-meta text-muted-foreground">Sin cambios registrados.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {auditLogs.map((log) => (
                  <li key={log.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-meta">
                      <span className="font-medium text-foreground">{log.action}</span>
                      <span className="text-muted-foreground">
                        {formatAbsoluteDateEs(log.created_at)}
                      </span>
                    </div>
                    <p className="text-meta text-muted-foreground">{log.actor_email ?? "—"}</p>
                    {summarizeDetails(log.details).map((line) => (
                      <p key={line} className="text-meta text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const inputClass = cn(
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-body text-foreground",
  "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring placeholder:text-muted-foreground",
);

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-meta font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function DataPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  );
}

/** Render an audit-log `details` diff as human-readable lines (non-secret). */
function summarizeDetails(details: Json | null): string[] {
  if (details === null || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }
  const lines: string[] = [];
  for (const [field, change] of Object.entries(details)) {
    if (change !== null && typeof change === "object" && !Array.isArray(change)) {
      const from = "from" in change ? formatValue(change.from) : "—";
      const to = "to" in change ? formatValue(change.to) : "—";
      lines.push(`${field}: ${from} → ${to}`);
    }
  }
  return lines;
}

function formatValue(value: Json | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value === "" ? "(vacío)" : value;
  return String(value);
}

interface ActionPillProps {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function ActionPill({ icon: Icon, label, onClick, disabled, active }: ActionPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-meta font-medium outline-none transition-colors",
        "hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? "text-primary" : "text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}
