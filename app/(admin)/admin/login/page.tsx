"use client";

import { LogIn, MailCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import {
  createBrowserSupabaseClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

/**
 * Admin login (Task 33.3 / R10.4, R10.5).
 *
 * A Client Component using the browser (anon) Supabase client. It authenticates
 * with a **passwordless magic link** via `signInWithOtp`: the admin enters their
 * email, receives a one-time sign-in link, and lands back here authenticated.
 * Magic link is chosen over a password form to avoid storing/managing admin
 * passwords — the allowlist in `ADMIN_EMAIL` (R10.6) is what actually authorizes
 * access, enforced by `middleware.ts` and the server guards.
 *
 * On an existing/new session the page redirects to the post-login target: the
 * `redirect` query param when it is a safe internal `/admin` path, otherwise
 * `/admin`. The target is validated to prevent an open redirect. The admin area
 * is never linked from the public navigation (R10.5).
 *
 * The form reads `useSearchParams()`, so it is wrapped in a `<Suspense>`
 * boundary (required for static generation; see Next.js CSR-bailout docs).
 */

const DEFAULT_TARGET = "/admin";

/** Only allow same-site `/admin` targets (never `/admin/login`, never absolute). */
function safeRedirectTarget(raw: string | null): string {
  if (!raw) return DEFAULT_TARGET;
  // Must be a root-relative path, not a protocol-relative `//host` redirect.
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_TARGET;
  if (!raw.startsWith("/admin")) return DEFAULT_TARGET;
  if (raw === "/admin/login" || raw.startsWith("/admin/login")) return DEFAULT_TARGET;
  return raw;
}

type Status = "idle" | "sending" | "sent" | "error";

/** Shared centered card shell so the form and its Suspense fallback match. */
function LoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[22px] border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-primary"
          >
            <LogIn className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h1 className="text-h5 font-semibold text-foreground">Panel de administración</h1>
          <p className="text-body text-muted-foreground">
            Acceso restringido. Te enviaremos un enlace de acceso a tu correo.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <LoginShell>
          <p className="text-center text-meta text-muted-foreground">Cargando…</p>
        </LoginShell>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Auth needs Supabase; when it isn't configured (e.g. local dev without creds)
  // build no client and show a clear notice instead of crashing the page.
  const supabase = useMemo(
    () => (isSupabaseBrowserConfigured() ? createBrowserSupabaseClient() : null),
    [],
  );

  const target = useMemo(
    () => safeRedirectTarget(searchParams.get("redirect")),
    [searchParams],
  );

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // If the visitor is (or becomes) authenticated — including the magic-link
  // return, which the browser client exchanges automatically — go to the
  // post-login target. Server middleware still enforces the allowlist.
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) router.replace(target);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        router.replace(target);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, router, target]);

  const handleSubmit = useCallback(
    async (formEvent: FormEvent<HTMLFormElement>) => {
      formEvent.preventDefault();
      const trimmed = email.trim();
      if (trimmed === "") {
        setStatus("error");
        setMessage("Escribe tu correo electrónico.");
        return;
      }

      if (!supabase) {
        setStatus("error");
        setMessage(
          "El acceso de administración no está configurado en este entorno.",
        );
        return;
      }

      setStatus("sending");
      setMessage(null);

      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/admin/login?redirect=${encodeURIComponent(target)}`
          : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo },
      });

      if (error) {
        setStatus("error");
        setMessage(
          "No pudimos enviar el enlace de acceso. Revisa el correo e inténtalo de nuevo.",
        );
        return;
      }

      setStatus("sent");
      setMessage(
        "Te enviamos un enlace de acceso. Revisa tu correo y ábrelo en este dispositivo.",
      );
    },
    [email, supabase, target],
  );

  const sending = status === "sending";

  if (!supabase) {
    return (
      <LoginShell>
        <p
          role="status"
          className="rounded-xl border border-border bg-surface-elevated px-4 py-6 text-center text-body text-muted-foreground"
        >
          El acceso de administración no está configurado en este entorno. Define
          las variables de Supabase (<code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) para habilitar el inicio de
          sesión.
        </p>
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      {status === "sent" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-6 text-center"
        >
          <MailCheck aria-hidden="true" className="h-7 w-7 text-success" strokeWidth={1.75} />
          <p className="text-body text-foreground">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-email" className="text-body font-medium text-foreground">
              Correo electrónico
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(changeEvent) => setEmail(changeEvent.target.value)}
              aria-invalid={status === "error"}
              aria-describedby={message ? "admin-login-message" : undefined}
              className={cn(
                "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-body text-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                "placeholder:text-muted-foreground",
              )}
              placeholder="tu@correo.com"
            />
          </div>

          {status === "error" && message ? (
            <p id="admin-login-message" role="alert" className="text-meta text-danger">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={sending}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5",
              "text-body font-semibold text-primary-foreground",
              "transition-colors duration-fast ease-emphasized hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {sending ? "Enviando…" : "Enviar enlace de acceso"}
          </button>
        </form>
      )}
    </LoginShell>
  );
}
