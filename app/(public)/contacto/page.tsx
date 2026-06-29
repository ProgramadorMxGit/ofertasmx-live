import { Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";

import { publicEnv } from "@/lib/env";

/**
 * `/contacto` — a simple contact page (Task 28.2, R10.1).
 *
 * A static Server Component. The primary channel is the public WhatsApp invite
 * (from the public env), plus a generic contact-email placeholder derived from
 * the public site domain. It deliberately does **not** read any server secret
 * (e.g. `ADMIN_EMAIL`) into the page, and explains how to report an expired
 * offer (R21.3).
 */
export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Contáctanos por WhatsApp o correo. Reporta una oferta expirada o cuéntanos cualquier duda sobre Ofertas Reales IA.",
  alternates: { canonical: "/contacto" },
};

/** A contact-email placeholder derived from the public site domain (never a secret). */
function contactEmail(): string {
  try {
    const host = new URL(publicEnv.NEXT_PUBLIC_SITE_URL).hostname.replace(
      /^www\./,
      "",
    );
    return `contacto@${host}`;
  } catch {
    return "contacto@programadormx.online";
  }
}

export default function ContactoPage() {
  const whatsappUrl = publicEnv.NEXT_PUBLIC_WHATSAPP_INVITE_URL;
  const email = contactEmail();

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-h2 tracking-tight text-foreground">
        Contacto
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted-foreground">
        ¿Tienes una duda o quieres avisarnos de algo? La forma más rápida de
        contactarnos es por WhatsApp.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface p-6 transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-primary">
            <MessageCircle aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-h6 font-semibold text-foreground">WhatsApp</span>
          <span className="text-meta leading-relaxed text-muted-foreground">
            Únete al grupo y escríbenos. Es la vía más rápida para respuestas y
            avisos.
          </span>
        </a>

        <a
          href={`mailto:${email}`}
          className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface p-6 transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-primary">
            <Mail aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-h6 font-semibold text-foreground">Correo</span>
          <span className="text-meta leading-relaxed text-muted-foreground">
            Escríbenos a{" "}
            <span className="font-medium text-foreground">{email}</span> y te
            responderemos en cuanto podamos.
          </span>
        </a>
      </div>

      <section className="mt-10">
        <h2 className="text-h5 font-semibold text-foreground">
          Reportar una oferta expirada
        </h2>
        <p className="mt-2 text-body leading-relaxed text-muted-foreground">
          Si una oferta ya cambió de precio o dejó de estar disponible,
          avísanos por WhatsApp o por correo e incluye el enlace de la oferta o
          su título. Así la localizamos y la actualizamos rápido. Recuerda que
          los precios y la disponibilidad pueden cambiar en la tienda en
          cualquier momento.
        </p>
      </section>
    </article>
  );
}
