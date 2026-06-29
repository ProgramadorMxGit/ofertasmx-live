"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { NoResultsState } from "@/components/ui/states";
import type { OfferPlatform, PublicOffer } from "@/lib/offers/query";
import { useFocusTrap } from "@/lib/ui/use-focus-trap";
import { cn } from "@/lib/utils/cn";
import { formatMXN } from "@/lib/utils/money";

/**
 * `SearchCommand` — debounced command-palette search (Task 23.4 / R16.5–R16.7,
 * R25.4).
 *
 * A Client Component. It searches the provided offers by title and platform
 * with a short debounce (R16.5), highlights matches discreetly (`<mark>`), and
 * shows a friendly "sin resultados" state when nothing matches (R16.6). It
 * opens with "/" or Ctrl/Cmd+K — both ignored while focus is in an
 * input/textarea/select or other editable element so it never hijacks form
 * typing (R16.7) — closes on Escape, and renders a focus-trapped modal dialog
 * (R25.4).
 *
 * Matching is accent- and case-insensitive; the visible highlight is a simple
 * case-insensitive substring wrap, kept deliberately subtle.
 */

const PLATFORM_LABELS: Record<OfferPlatform, string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 8;

/** Lowercase + strip diacritics for tolerant matching. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** Wrap case-insensitive substring matches of `query` in `text` with `<mark>`. */
function highlightMatch(text: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (trimmed === "") return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "ig"));
  const lowerQuery = trimmed.toLowerCase();
  return parts.map((part, index) =>
    part.toLowerCase() === lowerQuery ? (
      <mark key={index} className="rounded bg-primary/20 text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

export interface SearchCommandProps {
  offers: PublicOffer[];
  /** Show the inline trigger button (set false to drive it only via keys). */
  showTrigger?: boolean;
  className?: string;
}

export function SearchCommand({
  offers,
  showTrigger = true,
  className,
}: SearchCommandProps) {
  const [open, setOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Debounce the query (R16.5).
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(rawQuery), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  // Global open shortcuts: "/" and Ctrl/Cmd+K, ignored inside form fields (R16.7).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isSlash = event.key === "/";
      const isCmdK = (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey);
      if (!isSlash && !isCmdK) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFocusTrap(open, dialogRef, close);

  // Focus the input when the dialog opens (after the focus trap initializes).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const needle = fold(debouncedQuery.trim());
    if (needle === "") return [];
    return offers
      .filter(
        (offer) =>
          fold(offer.title).includes(needle) ||
          fold(PLATFORM_LABELS[offer.platform]).includes(needle),
      )
      .slice(0, MAX_RESULTS);
  }, [debouncedQuery, offers]);

  const hasQuery = debouncedQuery.trim() !== "";

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-meta text-muted-foreground",
            "transition-colors duration-fast ease-emphasized hover:bg-surface-elevated",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            className,
          )}
          aria-label="Buscar ofertas"
        >
          <Search aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          <span>Buscar ofertas</span>
          <kbd className="ml-1 rounded border border-border px-1.5 py-0.5 text-[0.7rem] font-medium">
            /
          </kbd>
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={close}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Buscar ofertas"
            tabIndex={-1}
            className="relative mt-[8vh] w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-xl outline-none"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search
                aria-hidden="true"
                className="h-5 w-5 text-muted-foreground"
                strokeWidth={2}
              />
              <input
                ref={inputRef}
                type="search"
                value={rawQuery}
                onChange={(event) => setRawQuery(event.target.value)}
                placeholder="Buscar por producto o plataforma…"
                aria-label="Término de búsqueda"
                className="w-full bg-transparent text-body text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar búsqueda"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!hasQuery ? (
                <p className="px-3 py-6 text-center text-meta text-muted-foreground">
                  Escribe para buscar entre las ofertas.
                </p>
              ) : results.length === 0 ? (
                <NoResultsState />
              ) : (
                <ul className="flex flex-col" aria-label="Resultados">
                  {results.map((offer) => (
                    <li key={offer.id}>
                      <Link
                        href={`/ofertas/${offer.slug}`}
                        onClick={close}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-body text-foreground">
                            {highlightMatch(offer.title, debouncedQuery)}
                          </span>
                          <span className="block text-meta text-muted-foreground">
                            {PLATFORM_LABELS[offer.platform]}
                          </span>
                        </span>
                        <span className="shrink-0 text-body font-semibold tabular-nums text-foreground font-tabular">
                          {formatMXN(offer.current_price)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
