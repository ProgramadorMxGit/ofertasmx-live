"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Info,
  XCircle,
} from "lucide-react";
import { useState, useTransition } from "react";

import { OfferCard } from "@/components/offers/offer-card";
import type { TestMessageAnalysis } from "@/lib/telegram/test-message";
import { cn } from "@/lib/utils/cn";
import { formatMXN } from "@/lib/utils/money";

import { analyzeMessageAction, type AnalyzeMessageResult } from "@/app/(admin)/admin/probar/actions";

/**
 * `TestMessagePanel` — admin "Probar mensaje" dry-run (Task 35 / R23.6).
 *
 * A Client Component: paste a Telegram message, press "Analizar", and the
 * {@link analyzeMessageAction} Server Action runs the **same** parser/validator
 * as the webhook and returns the detected fields, the rejection reason or
 * review warnings, the derived identity (fingerprint, slug, category) and a live
 * {@link OfferCard} preview — **without publishing or storing anything**. The
 * no-persist guarantee is made explicit in the UI so it is unmistakably a
 * preview. The platform price toggle (`showAmazonPrices`) is threaded from the
 * server so the preview matches the public card.
 */

const PLATFORM_LABEL: Record<"amazon" | "mercado_libre", string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

const STATUS_LABEL: Record<"active" | "needs_review" | "rejected", string> = {
  active: "Activa",
  needs_review: "Por revisar",
  rejected: "Rechazada (no se guardaría)",
};

export interface TestMessagePanelProps {
  /** Derived `SHOW_AMAZON_PRICES` flag, so the preview matches public cards. */
  showAmazonPrices: boolean;
}

export function TestMessagePanel({ showAmazonPrices }: TestMessagePanelProps) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AnalyzeMessageResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleAnalyze = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        const next = await analyzeMessageAction({ text: message, caption: "" });
        setResult(next);
      } catch {
        setFailed(true);
        setResult(null);
      }
    });
  };

  const handleClear = () => {
    setMessage("");
    setResult(null);
    setFailed(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* No-persist notice (R23.6) */}
      <p
        role="note"
        className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-meta text-muted-foreground"
      >
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <span>
          Esto es una <strong className="font-semibold text-foreground">vista previa</strong>. Se
          ejecuta el mismo análisis que el webhook, pero no se publica ni se guarda nada en la base
          de datos.
        </span>
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Input */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <label htmlFor="test-message" className="text-meta font-medium text-muted-foreground">
            Mensaje de Telegram
          </label>
          <textarea
            id="test-message"
            rows={10}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={"Pega aquí el texto (o pie de foto) de un mensaje de Telegram…"}
            className={cn(
              "w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-body text-foreground",
              "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring placeholder:text-muted-foreground",
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isPending || message.trim() === ""}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-primary px-5 py-2.5",
                "text-body font-semibold text-primary-foreground outline-none transition-colors",
                "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <FlaskConical aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              {isPending ? "Analizando…" : "Analizar"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={isPending || (message === "" && result === null)}
              className={cn(
                "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-border px-4 py-2.5",
                "text-meta font-medium text-foreground outline-none transition-colors",
                "hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              Limpiar
            </button>
          </div>
        </section>

        {/* Results */}
        <section aria-live="polite" className="flex flex-col gap-4">
          {failed ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-meta text-danger">
              No se pudo analizar el mensaje. Inténtalo de nuevo.
            </p>
          ) : null}

          {result === null ? (
            !failed ? (
              <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-meta text-muted-foreground">
                Pega un mensaje y pulsa &quot;Analizar&quot; para ver el resultado.
              </p>
            ) : null
          ) : (
            <AnalysisResult result={result} showAmazonPrices={showAmazonPrices} />
          )}
        </section>
      </div>
    </div>
  );
}

function AnalysisResult({
  result,
  showAmazonPrices,
}: {
  result: AnalyzeMessageResult;
  showAmazonPrices: boolean;
}) {
  if (result.status === "unauthorized") {
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-meta text-danger">
        Tu sesión expiró. Vuelve a iniciar sesión para continuar.
      </p>
    );
  }

  if (result.status === "empty") {
    return (
      <p className="rounded-lg bg-surface px-3 py-2 text-meta text-muted-foreground">
        El mensaje está vacío.
      </p>
    );
  }

  if (result.status === "rejected") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-h6 font-semibold text-danger">
          <XCircle aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          Mensaje rechazado
        </h2>
        <p className="text-meta text-foreground">{result.message}</p>
        <p className="text-meta text-muted-foreground">
          El webhook no crearía una oferta a partir de este mensaje.
        </p>
      </div>
    );
  }

  const { fields, derived, warnings, outcome, needsReview, preview } = result;
  const platformLabel = fields.platform ? PLATFORM_LABEL[fields.platform] : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Outcome banner */}
      <OutcomeBanner status={outcome.resultingStatus} needsReview={needsReview} />

      {/* No-merchant notice (parity with webhook rejection) */}
      {outcome.rejectionReason === "no_allowed_merchant" ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-meta text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          No se detectó un enlace de comercio permitido (Amazon o Mercado Libre). El webhook
          rechazaría esta oferta.
        </p>
      ) : null}

      {/* Warnings */}
      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-meta text-warning">
          {warnings.map((warning) => (
            <li key={warning.code} className="flex items-start gap-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Detected fields */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-h6 font-semibold text-foreground">Campos detectados</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-meta">
          <DataPair label="Título" value={fields.title || "—"} span />
          <DataPair label="Plataforma" value={platformLabel} />
          <DataPair label="Comercio" value={fields.merchant ?? "—"} />
          <DataPair label="Precio actual" value={formatMXN(fields.currentPrice)} />
          <DataPair
            label="Precio original"
            value={fields.originalPrice !== null ? formatMXN(fields.originalPrice) : "—"}
          />
          <DataPair
            label="Descuento"
            value={fields.discountPercent !== null ? `${fields.discountPercent}%` : "—"}
          />
          <DataPair label="ID externo" value={fields.externalProductId ?? "—"} />
          <DataPair label="Tag de afiliado" value={fields.affiliateTag ?? "—"} />
        </dl>
        {fields.affiliateUrl ? (
          <div className="flex flex-col gap-1">
            <span className="text-meta text-muted-foreground">Enlace de afiliado</span>
            <span className="break-all text-meta text-foreground">{fields.affiliateUrl}</span>
          </div>
        ) : null}
      </section>

      {/* Derived identity */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-h6 font-semibold text-foreground">Identidad derivada</h2>
        <dl className="flex flex-col gap-2 text-meta">
          <DataPair label="Categoría" value={derived.category} />
          <DataPair label="Slug" value={derived.slug} mono />
          <DataPair label="Fingerprint" value={derived.fingerprint} mono />
        </dl>
      </section>

      {/* Live preview */}
      {preview !== null ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h6 font-semibold text-foreground">Vista previa de la tarjeta</h2>
          <OfferCard offer={preview} showAmazonPrices={showAmazonPrices} />
        </section>
      ) : null}
    </div>
  );
}

function OutcomeBanner({
  status,
  needsReview,
}: {
  status: "active" | "needs_review" | "rejected";
  needsReview: boolean;
}) {
  if (status === "rejected") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-meta font-medium text-danger">
        <XCircle aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        Resultado: {STATUS_LABEL[status]}
      </p>
    );
  }
  if (status === "needs_review" || needsReview) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-meta font-medium text-warning">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        Resultado: {STATUS_LABEL.needs_review}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-meta font-medium text-success">
      <CheckCircle2 aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
      Resultado: {STATUS_LABEL.active}
    </p>
  );
}

function DataPair({
  label,
  value,
  span,
  mono,
}: {
  label: string;
  value: string;
  span?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", span && "col-span-2")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("break-words text-foreground", mono && "break-all font-mono text-[0.8em]")}>
        {value}
      </dd>
    </div>
  );
}
