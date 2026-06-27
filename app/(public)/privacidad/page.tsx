import type { Metadata } from "next";
import Link from "next/link";

/**
 * `/privacidad` — a clear, honest privacy page (Task 28.2, R10.1).
 *
 * A static Server Component describing the minimal data the system stores: click
 * analytics (source + referrer domain, never a full IP), affiliate cookies set
 * by the merchants (not by us), and the Telegram payload retained for debugging.
 * It mirrors the real data model (`offer_clicks`, `telegram_updates`) rather
 * than inventing claims.
 */
export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos mínimos guardamos: analítica de clics sin IP completa, cookies de afiliado que ponen las tiendas y la retención de mensajes de Telegram para depuración.",
  alternates: { canonical: "/privacidad" },
};

interface Block {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

const BLOCKS: readonly Block[] = [
  {
    heading: "Analítica mínima de clics",
    paragraphs: [
      "Cuando tocas el botón para ir a una tienda, registramos datos mínimos y agregados para entender qué ofertas son útiles: de qué parte del sitio salió el clic (por ejemplo, una tarjeta o el detalle) y el dominio desde el que llegaste.",
      "No guardamos tu dirección IP completa ni creamos un perfil tuyo. No usamos esta información para identificarte.",
    ],
  },
  {
    heading: "Cookies de afiliado de las tiendas",
    paragraphs: [
      "Al abrir un enlace, Amazon o Mercado Libre pueden colocar sus propias cookies de afiliado en tu navegador. Esas cookies las define la tienda, no nosotros, y se rigen por las políticas de privacidad de cada tienda.",
      "Nosotros no colocamos cookies de seguimiento publicitario propias.",
    ],
  },
  {
    heading: "Mensajes de Telegram",
    paragraphs: [
      "Las ofertas llegan desde un canal de Telegram. Guardamos el contenido de esos mensajes (el texto y los datos de la oferta) para procesarlos, evitar duplicados y poder depurar errores si una oferta no se publica bien.",
      "Estos datos provienen del canal de ofertas, no de tu actividad como visitante.",
    ],
  },
  {
    heading: "Preferencias en tu navegador",
    paragraphs: [
      "Guardamos tu preferencia de tema (claro u oscuro) localmente en tu navegador para recordarla entre visitas. Esa preferencia no se envía a ningún servidor.",
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-h2 tracking-tight text-foreground">
        Privacidad
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted-foreground">
        Guardamos lo mínimo para que el sitio funcione y mejore. Esto es lo que
        recopilamos y lo que no.
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
          <h2 className="text-h5 font-semibold text-foreground">¿Dudas?</h2>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            Si tienes preguntas sobre privacidad, escríbenos desde la página de{" "}
            <Link
              href="/contacto"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              contacto
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
