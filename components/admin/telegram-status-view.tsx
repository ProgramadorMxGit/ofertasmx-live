"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Link2,
  RefreshCw,
  ServerOff,
} from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";

import { RelativeTime } from "@/components/offers/relative-time";
import type { TelegramStatus } from "@/lib/telegram/status";
import { cn } from "@/lib/utils/cn";

/**
 * `TelegramStatusView` — webhook status panel (Task 36 / R23.5).
 *
 * A Client Component seeded with the server-rendered {@link TelegramStatus} so
 * the first paint needs no client fetch, plus an on-demand "Actualizar" button
 * that re-fetches `GET /api/admin/telegram/status`. It renders friendly
 * empty/unavailable states: no Bot Token configured (local dev), Telegram
 * unreachable, no updates received yet. No secret is ever shown — the status
 * payload never contains one. The {@link TelegramStatus} type is imported
 * type-only, so the `server-only` status module is never pulled into the bundle.
 */

export interface TelegramStatusViewProps {
  initialStatus: TelegramStatus;
}

/** Convert a Telegram unix-seconds timestamp to an ISO string for display. */
function unixSecondsToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

export function TelegramStatusView({ initialStatus }: TelegramStatusViewProps) {
  const [status, setStatus] = useState<TelegramStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/telegram/status", {
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          setError("No se pudo actualizar el estado.");
          return;
        }
        const data: unknown = await response.json();
        setStatus(data as TelegramStatus);
      } catch {
        setError("No se pudo actualizar el estado.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2",
            "text-meta font-medium text-foreground outline-none transition-colors",
            "hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-focus-ring",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn("h-4 w-4", isPending && "animate-spin motion-reduce:animate-none")}
            strokeWidth={1.75}
          />
          {isPending ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-meta text-danger">
          {error}
        </p>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-4">
        <WebhookSection webhook={status.webhook} />

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-foreground">
            <Inbox aria-hidden="true" className="h-5 w-5 text-primary" strokeWidth={1.75} />
            Última actualización recibida
          </h2>
          {status.lastUpdate ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-meta">
              <Pair label="Recibida">
                <RelativeTime iso={status.lastUpdate.receivedAt} />
              </Pair>
              <Pair label="Tipo">{status.lastUpdate.updateType ?? "—"}</Pair>
              <Pair label="Estado de procesamiento">{status.lastUpdate.processingStatus}</Pair>
            </dl>
          ) : (
            <p className="text-meta text-muted-foreground">
              Aún no se ha recibido ninguna actualización.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-h6 font-semibold text-foreground">Errores recientes</h2>
          <p
            className={cn(
              "text-h5 font-semibold tabular-nums font-tabular",
              status.recentErrorCount > 0 ? "text-warning" : "text-foreground",
            )}
          >
            {status.recentErrorCount}
          </p>
          <p className="text-meta text-muted-foreground">
            Actualizaciones con error en las últimas {status.recentWindowHours} horas.
          </p>
        </section>
      </div>
    </div>
  );
}

function WebhookSection({ webhook }: { webhook: TelegramStatus["webhook"] }) {
  if (!webhook.available) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-h6 font-semibold text-foreground">
          <Link2 aria-hidden="true" className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          Webhook
        </h2>
        <p className="flex items-start gap-2 text-meta text-muted-foreground">
          <ServerOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          No hay un token de Telegram configurado en este entorno, así que no se puede consultar el
          estado del webhook.
        </p>
      </section>
    );
  }

  if (!webhook.reachable) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-h6 font-semibold text-foreground">
          <Link2 aria-hidden="true" className="h-5 w-5 text-warning" strokeWidth={1.75} />
          Webhook
        </h2>
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-meta text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          No se pudo contactar a Telegram: {webhook.error}
        </p>
      </section>
    );
  }

  const hasUrl = webhook.url !== null && webhook.url !== "";
  const hasError = webhook.lastErrorMessage !== null && webhook.lastErrorMessage !== "";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-h6 font-semibold text-foreground">
        <Link2 aria-hidden="true" className="h-5 w-5 text-primary" strokeWidth={1.75} />
        Webhook
      </h2>

      <div className="flex flex-col gap-1">
        <span className="text-meta text-muted-foreground">URL registrada</span>
        {hasUrl ? (
          <span className="break-all text-meta text-foreground">{webhook.url}</span>
        ) : (
          <span className="text-meta text-warning">Sin configurar</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-meta">
        <Pair label="Actualizaciones pendientes">
          <span className="tabular-nums font-tabular">{webhook.pendingUpdateCount ?? 0}</span>
        </Pair>
      </dl>

      {hasError ? (
        <div className="flex flex-col gap-1 rounded-lg bg-warning/10 px-3 py-2 text-meta text-warning">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            Último error de Telegram
          </p>
          <p>{webhook.lastErrorMessage}</p>
          {webhook.lastErrorDate !== null ? (
            <p className="text-muted-foreground">
              <RelativeTime iso={unixSecondsToIso(webhook.lastErrorDate)} />
            </p>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-meta text-success">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          Sin errores reportados por Telegram.
        </p>
      )}
    </section>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  );
}
