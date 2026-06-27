import type { Metadata } from "next";
import Link from "next/link";

/**
 * `/terminos` — terms of use (Task 28.2, R10.1).
 *
 * A static Server Component: an informational deals site, an affiliate
 * disclosure, no warranty on prices/availability, and links to third parties.
 * Honest and concise — not legal advice, no invented guarantees.
 */
export const metadata: Metadata = {
  title: "Términos de uso",
  description:
    "Términos de uso de Ofertas Reales IA: un sitio informativo de ofertas con enlaces de afiliado, sin garantía sobre precios o disponibilidad y con enlaces a tiendas de terceros.",
  alternates: { canonical: "/terminos" },
};

interface Block {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

const BLOCKS: readonly Block[] = [
  {
    heading: "Un sitio informativo",
    paragraphs: [
      "Ofertas Reales IA es un sitio informativo que reúne y muestra ofertas de Amazon México y Mercado Libre. No vendemos productos, no procesamos pagos y no gestionamos envíos, garantías ni devoluciones.",
    ],
  },
  {
    heading: "Enlaces de afiliado",
    paragraphs: [
      "Usamos enlaces de afiliado. Si compras a través de ellos, podemos recibir una comisión de la tienda, sin costo adicional para ti. Como Afiliado de Amazon, ganamos por compras elegibles.",
    ],
  },
  {
    heading: "Sin garantía sobre precios o disponibilidad",
    paragraphs: [
      "Los precios, descuentos y la disponibilidad que mostramos corresponden al momento en que detectamos la oferta y pueden cambiar en cualquier momento en la tienda. No garantizamos su exactitud ni su vigencia. El precio y las condiciones válidos son siempre los que aparecen en la tienda al momento de comprar.",
    ],
  },
  {
    heading: "Enlaces a terceros",
    paragraphs: [
      "El sitio enlaza a tiendas de terceros (Amazon México y Mercado Libre). No somos responsables del contenido, las políticas ni las prácticas de esos sitios. Al seguir un enlace, aplican los términos y la privacidad de la tienda correspondiente.",
    ],
  },
  {
    heading: "Uso del sitio",
    paragraphs: [
      "Ofrecemos el sitio &ldquo;tal cual&rdquo;, procurando que la información sea correcta pero sin garantías. Usa el sitio de forma razonable y no intentes interferir con su funcionamiento.",
    ],
  },
];

export default function TerminosPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-h2 tracking-tight text-foreground">
        Términos de uso
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted-foreground">
        Un resumen claro de las reglas para usar Ofertas Reales IA. Esto no es
        asesoría legal.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        {BLOCKS.map((block) => (
          <section key={block.heading}>
            <h2 className="text-h5 font-semibold text-foreground">
              {block.heading}
            </h2>
            {block.paragraphs.map((paragraph, index) => (
              <p
                key={index}
                className="mt-2 text-body leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section>
          <h2 className="text-h5 font-semibold text-foreground">Más información</h2>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            Consulta también nuestra{" "}
            <Link
              href="/transparencia-afiliados"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              transparencia de afiliados
            </Link>{" "}
            y la{" "}
            <Link
              href="/privacidad"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              política de privacidad
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
