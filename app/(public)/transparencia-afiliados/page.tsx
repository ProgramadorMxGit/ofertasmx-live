import type { Metadata } from "next";
import Link from "next/link";

import { publicEnv } from "@/lib/env";

/**
 * `/transparencia-afiliados` — the full affiliate transparency page (Task 28.2,
 * R21.3, R21.1).
 *
 * A static Server Component covering every point R21.3 requires: what an
 * affiliate link is, that the visitor's price does not increase, that prices and
 * availability can change, that the site is not Amazon nor Mercado Libre, how
 * offers are selected, which parts of the process are automatic, and how to
 * report an expired offer. It also carries the required Amazon disclosure
 * (R21.1). Honest throughout — no invented figures (honesty rector).
 */
export const metadata: Metadata = {
  title: "Transparencia de afiliados",
  description:
    "Qué es un enlace de afiliado, por qué el precio para ti no aumenta, cómo seleccionamos las ofertas, qué partes del proceso son automáticas y cómo reportar una oferta expirada.",
  alternates: { canonical: "/transparencia-afiliados" },
};

interface Block {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

const BLOCKS: readonly Block[] = [
  {
    heading: "Qué es un enlace de afiliado",
    paragraphs: [
      "Un enlace de afiliado es un enlace especial a un producto de una tienda (Amazon México o Mercado Libre). Cuando lo usas y completas una compra, la tienda puede pagarnos una pequeña comisión por haberte recomendado el producto.",
      "Es la forma en que mantenemos el sitio gratuito: no te cobramos nada y no necesitas registrarte.",
    ],
  },
  {
    heading: "El precio para ti no aumenta",
    paragraphs: [
      "Usar nuestros enlaces no cambia el precio que pagas. Pagas exactamente lo mismo que si entraras a la tienda por tu cuenta. La comisión la paga la tienda, no tú.",
    ],
  },
  {
    heading: "Los precios y la disponibilidad pueden cambiar",
    paragraphs: [
      "Mostramos el precio y el descuento que detectamos en el momento de publicar la oferta. Las tiendas actualizan sus precios y existencias continuamente, así que el valor que ves aquí puede no coincidir con el de la tienda cuando abres el enlace.",
      "Confirma siempre el precio final y los detalles del producto directamente en la tienda antes de comprar.",
    ],
  },
  {
    heading: "No somos Amazon ni Mercado Libre",
    paragraphs: [
      "Ofertas Reales IA es un sitio independiente. No vendemos productos, no procesamos pagos y no gestionamos envíos ni devoluciones. Solo te avisamos de ofertas y te enviamos a la tienda oficial, donde se realiza toda la compra.",
    ],
  },
  {
    heading: "Cómo seleccionamos las ofertas",
    paragraphs: [
      "Las ofertas llegan a nuestro canal y el sistema las procesa automáticamente: normaliza el texto, extrae el precio y el descuento, valida que el enlace apunte a Amazon México o a Mercado Libre y clasifica el producto por categoría.",
      "Una oferta solo se publica si pasa esas comprobaciones. Si algo no cuadra (por ejemplo, un enlace fuera de las tiendas permitidas o un descuento incoherente), queda marcada para revisión y no se muestra.",
    ],
  },
  {
    heading: "Qué partes del proceso son automáticas",
    paragraphs: [
      "La detección, la extracción de datos, la validación del enlace y la publicación son automáticas. No hay una persona revisando cada oferta una por una, por lo que no afirmamos una verificación humana que no existe. Por eso te pedimos que confirmes siempre los datos en la tienda.",
    ],
  },
];

export default function TransparenciaAfiliadosPage() {
  const whatsappUrl = publicEnv.NEXT_PUBLIC_WHATSAPP_INVITE_URL;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-h2 tracking-tight text-foreground">
        Transparencia de afiliados
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted-foreground">
        Queremos que entiendas exactamente cómo funciona el sitio y cómo
        ganamos dinero. Sin letra pequeña.
      </p>

      {/* Required Amazon disclosure (R21.1). */}
      <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 text-body text-foreground">
        Como Afiliado de Amazon, gano por compras elegibles.
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

        {/* How to report an expired offer (R21.3). */}
        <section>
          <h2 className="text-h5 font-semibold text-foreground">
            Cómo reportar una oferta expirada
          </h2>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            Si encuentras una oferta cuyo precio ya cambió o que ya no está
            disponible, avísanos y la revisamos. Puedes escribirnos por nuestro
            grupo de WhatsApp o desde la página de contacto; indícanos el enlace
            de la oferta o su título para localizarla rápido.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground transition-colors duration-fast ease-emphasized hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Avisar por WhatsApp
            </a>
            <Link
              href="/contacto"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-5 py-2.5 text-body font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Ir a contacto
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
