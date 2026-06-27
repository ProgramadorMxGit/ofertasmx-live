import {
  CloudOff,
  Loader2,
  PackageOpen,
  RadioTower,
  SearchX,
  Sparkles,
  TimerOff,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusBlock } from "./status-block";

/**
 * Friendly, non-technical UI states (R26.1, R26.2). Each is a thin wrapper over
 * `StatusBlock` with Spanish copy and a meaningful icon. All are presentational
 * Server-compatible components; interactive affordances (retry, reset) are
 * passed in via the optional `action` slot so the components stay reusable.
 */

interface ActionableStateProps {
  action?: ReactNode;
  className?: string;
}

/** No offers exist yet (first run / quiet period). */
export function EmptyState({ action, className }: ActionableStateProps) {
  return (
    <StatusBlock
      icon={PackageOpen}
      tone="neutral"
      title="Aún no hay ofertas"
      description="En cuanto detectemos ofertas reales, aparecerán aquí. Vuelve pronto."
      action={action}
      className={className}
    />
  );
}

/** A search or filter combination returned nothing (R16.6). */
export function NoResultsState({ action, className }: ActionableStateProps) {
  return (
    <StatusBlock
      icon={SearchX}
      tone="neutral"
      title="Sin resultados"
      description="No encontramos ofertas con esos filtros. Prueba con otra búsqueda o quita algún filtro."
      action={action}
      className={className}
    />
  );
}

/** The offers list failed to load (network/server). */
export function NetworkErrorState({ action, className }: ActionableStateProps) {
  return (
    <StatusBlock
      icon={CloudOff}
      tone="danger"
      role="alert"
      title="Problema de conexión"
      description="No pudimos cargar las ofertas. Revisa tu conexión e inténtalo de nuevo."
      action={action}
      className={className}
    />
  );
}

/** Realtime channel dropped; the user still sees the last loaded offers. */
export function RealtimeDisconnectedState({
  action,
  className,
  compact = false,
}: ActionableStateProps & { compact?: boolean }) {
  return (
    <StatusBlock
      icon={RadioTower}
      tone="warning"
      compact={compact}
      title="Sin conexión en vivo"
      description="Estás viendo las últimas ofertas guardadas. Nos reconectaremos automáticamente."
      action={action}
      className={className}
    />
  );
}

/** A transient retry is in progress. */
export function RetryingState({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <StatusBlock
      icon={Loader2}
      tone="info"
      compact={compact}
      iconClassName="animate-spin motion-reduce:animate-none"
      title="Reintentando…"
      description="Estamos volviendo a intentarlo. Esto tomará solo un momento."
      className={className}
    />
  );
}

/** Offer is no longer guaranteed available (R9.6, R15.3). */
export function ExpiredOfferState({ action, className }: ActionableStateProps) {
  return (
    <StatusBlock
      icon={TimerOff}
      tone="warning"
      title="Esta oferta podría haber terminado"
      description="El precio o la disponibilidad pueden haber cambiado en la tienda."
      action={action}
      className={className}
    />
  );
}

/** Some offer fields are still being verified (R21.5). */
export function IncompleteDataState({ className }: { className?: string }) {
  return (
    <StatusBlock
      icon={TriangleAlert}
      tone="warning"
      title="Información incompleta"
      description="Algunos datos de esta oferta aún se están verificando."
      className={className}
    />
  );
}

/** No featured offers right now. */
export function NoFeaturedState({ className }: { className?: string }) {
  return (
    <StatusBlock
      icon={Sparkles}
      tone="neutral"
      title="Sin destacados por ahora"
      description="Cuando tengamos ofertas sobresalientes, las verás aquí."
      className={className}
    />
  );
}

/** Section or site temporarily unavailable. */
export function MaintenanceState({ action, className }: ActionableStateProps) {
  return (
    <StatusBlock
      icon={Wrench}
      tone="info"
      title="En mantenimiento"
      description="Estamos haciendo mejoras. Vuelve en unos minutos, por favor."
      action={action}
      className={className}
    />
  );
}
