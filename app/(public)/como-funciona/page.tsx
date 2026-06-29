import { Radar, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

/**
 * `/como-funciona` — an honest explanation of the automated pipeline (Task 28.2,
 * R10.1, R13.9).
 *
 * A static Server Component. It describes the detect → verify → publish flow and
 * is explicit about what is automatic; it never claims human verification that
 * does not happen (honesty rector, R21.5).
 */
export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Cómo detectamos, verificamos de forma automática y publicamos las ofertas reales de Amazon México y Mercado Libre, casi en tiempo real.",
  alternates: { canonical: "/como-funciona" },
};

interface Step {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    icon: Radar,
    title: "Detectamos",
    body: "Recibimos las ofertas desde nuestro canal de Telegram y las procesamos automáticamente en cuanto llegan. Leemos el mensaje, extraemos el título, el precio y el enlace, y normalizamos el texto.",
  },
  {
    icon: ShieldCheck,
    title: "Verificamos (de forma automática)",
    body: "El sistema valida que el enlace apunte a Amazon México o a Mercado Libre, recalcula el descuento a partir de los precios, comprueba que el enlace de afiliado tenga el formato correcto y clasifica la oferta por categoría. No hay revisión humana de cada oferta: todo este paso es automático.",
  },
  {
    icon: Send,
    title: "Publicamos",
    body: "Si la oferta cumple las comprobaciones, se publica al instante y aparece en vivo en el sitio. Si algo no cuadra, queda marcada para revisión y no se muestra hasta resolverse.",
  },
];

export default function ComoFuncionaPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-h2 tracking-tight text-foreground">
        Cómo funciona
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted-foreground">
        Ofertas Reales IA es un proceso automático de principio a fin. Así pasa
        una oferta desde que la detectamos hasta que la ves publicada.
      </p>

      <ol className="mt-10 flex flex-col gap-6">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-6"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-primary">
              <step.icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
            </span>
            <h2 className="text-h5 font-semibold text-foreground">
              <span className="mr-1 tabular-nums text-muted-foreground font-tabular">
                {index + 1}.
              </span>
              {step.title}
            </h2>
            <p className="text-body leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <section className="mt-10">
        <h2 className="text-h5 font-semibold text-foreground">
          Qué hacemos y qué no
        </h2>
        <p className="mt-2 text-body leading-relaxed text-muted-foreground">
          No inventamos precios, descuentos ni urgencia. No hacemos scraping
          desde tu navegador. No somos Amazon ni Mercado Libre: cuando tocas
          &ldquo;Ver en la tienda&rdquo;, te llevamos al sitio oficial mediante
          un enlace de afiliado. El precio y la disponibilidad finales siempre
          son los de la tienda y pueden cambiar sin previo aviso.
        </p>
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          ¿Quieres más detalle sobre los enlaces de afiliado y cómo
          seleccionamos las ofertas? Visita{" "}
          <Link
            href="/transparencia-afiliados"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Transparencia de afiliados
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
