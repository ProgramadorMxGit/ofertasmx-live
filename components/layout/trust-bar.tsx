import { RadioTower, ShieldCheck, Store, Wallet, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * `TrustBar` — honest trust indicators only (Task 25.2 / R13.5, R13.6).
 *
 * A Server Component (no interaction). It states only verifiable facts about
 * the service — realtime updates, verified links, the two supported
 * marketplaces and that it is free for buyers — and deliberately contains **no**
 * invented user, sales or savings figures (R13.6). Each item pairs an icon with
 * text so meaning never relies on color alone (R25.5). The 2-up → 4-up grid is
 * mobile-first and cannot overflow horizontally (R17.1, R17.3).
 */
interface TrustIndicator {
  readonly icon: LucideIcon;
  readonly label: string;
}

const INDICATORS: readonly TrustIndicator[] = [
  { icon: RadioTower, label: "Actualización en tiempo real" },
  { icon: ShieldCheck, label: "Enlaces verificados" },
  { icon: Store, label: "Amazon y Mercado Libre" },
  { icon: Wallet, label: "Sin costo para compradores" },
];

export interface TrustBarProps {
  className?: string;
}

export function TrustBar({ className }: TrustBarProps) {
  return (
    <section
      aria-label="Por qué confiar en Ofertas Reales IA"
      className={cn("w-full border-y border-border bg-surface/50", className)}
    >
      <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 px-4 py-4 sm:px-6 lg:grid-cols-4">
        {INDICATORS.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-primary">
              <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="min-w-0 text-meta font-medium text-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
