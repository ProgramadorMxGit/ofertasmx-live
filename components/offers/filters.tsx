"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useFocusTrap } from "@/lib/ui/use-focus-trap";
import { OFFER_CATEGORIES } from "@/lib/offers/categories";
import {
  DEFAULT_FILTER_STATE,
  parseFilters,
  serializeFilters,
  type FilterState,
} from "@/lib/offers/filters";
import { OFFER_PLATFORMS, type OfferPlatform, type OfferSort } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";

/**
 * `Filters` — platform / category / discount / price / sort, synced to the URL
 * (Task 23.3 / R16.1–R16.4, R17.2).
 *
 * A Client Component. The URL is the single source of truth: state is parsed
 * from `searchParams` (so load and back/forward navigation restore it, R16.4)
 * and every change is written back with `router.replace(..., { scroll: false })`
 * (R16.3). Serialization reuses the pure `lib/offers/filters` module, so the
 * emitted query string is canonical and directly consumable by `/api/offers`.
 * Unrelated params (e.g. a `view` toggle) are preserved across changes.
 *
 * On mobile the controls live in an accessible, focus-trapped drawer (R17.2);
 * on `md+` they render inline.
 */

const PLATFORM_LABELS: Record<OfferPlatform, string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

const SORT_LABELS: Record<OfferSort, string> = {
  recent: "Más recientes",
  discount: "Mayor descuento",
  price_asc: "Menor precio",
};

const MIN_DISCOUNT_OPTIONS = [10, 20, 30, 40, 50, 60, 70] as const;

/** Keys this component owns in the URL; everything else is preserved as-is. */
const FILTER_KEYS = new Set([
  "platform",
  "category",
  "minDiscount",
  "minPrice",
  "maxPrice",
  "sort",
  "q",
]);

const SELECT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const LABEL_CLASS = "flex flex-col gap-1 text-meta font-medium text-muted-foreground";

function buildQueryString(current: URLSearchParams, next: FilterState): string {
  const params = serializeFilters(next);
  current.forEach((value, key) => {
    if (!FILTER_KEYS.has(key) && !params.has(key)) params.append(key, value);
  });
  return params.toString();
}

interface FiltersFormProps {
  state: FilterState;
  minPriceInput: string;
  maxPriceInput: string;
  /** Hide the platform control when the route already scopes the platform. */
  lockPlatform: boolean;
  /** Hide the category control when the route already scopes the category. */
  lockCategory: boolean;
  onPlatform: (value: string) => void;
  onCategory: (value: string) => void;
  onMinDiscount: (value: string) => void;
  onSort: (value: string) => void;
  onMinPriceInput: (value: string) => void;
  onMaxPriceInput: (value: string) => void;
  onApplyPrice: () => void;
  onClear: () => void;
}

/** The control set, rendered both inline (desktop) and inside the drawer. */
function FiltersForm({
  state,
  minPriceInput,
  maxPriceInput,
  lockPlatform,
  lockCategory,
  onPlatform,
  onCategory,
  onMinDiscount,
  onSort,
  onMinPriceInput,
  onMaxPriceInput,
  onApplyPrice,
  onClear,
}: FiltersFormProps) {
  const onPriceKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      onApplyPrice();
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {lockPlatform ? null : (
        <label className={LABEL_CLASS}>
          <span>Plataforma</span>
          <select
            className={SELECT_CLASS}
            value={state.platform ?? ""}
            onChange={(event) => onPlatform(event.target.value)}
          >
            <option value="">Todas</option>
            {OFFER_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </option>
            ))}
          </select>
        </label>
      )}

      {lockCategory ? null : (
        <label className={LABEL_CLASS}>
          <span>Categoría</span>
          <select
            className={SELECT_CLASS}
            value={state.category ?? ""}
            onChange={(event) => onCategory(event.target.value)}
          >
            <option value="">Todas</option>
            {OFFER_CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={LABEL_CLASS}>
        <span>Descuento mínimo</span>
        <select
          className={SELECT_CLASS}
          value={state.minDiscount === null ? "" : String(state.minDiscount)}
          onChange={(event) => onMinDiscount(event.target.value)}
        >
          <option value="">Cualquier descuento</option>
          {MIN_DISCOUNT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}% o más
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL_CLASS}>
        <span>Ordenar por</span>
        <select
          className={SELECT_CLASS}
          value={state.sort}
          onChange={(event) => onSort(event.target.value)}
        >
          {(Object.keys(SORT_LABELS) as OfferSort[]).map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-meta font-medium text-muted-foreground">
          Rango de precio (MXN)
        </legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Mín."
            aria-label="Precio mínimo"
            className={SELECT_CLASS}
            value={minPriceInput}
            onChange={(event) => onMinPriceInput(event.target.value)}
            onBlur={onApplyPrice}
            onKeyDown={onPriceKeyDown}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            —
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Máx."
            aria-label="Precio máximo"
            className={SELECT_CLASS}
            value={maxPriceInput}
            onChange={(event) => onMaxPriceInput(event.target.value)}
            onBlur={onApplyPrice}
            onKeyDown={onPriceKeyDown}
          />
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-meta font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}

export interface FiltersProps {
  className?: string;
  /** Hide the platform control because the route already scopes it (e.g. `/amazon`). */
  lockPlatform?: boolean;
  /** Hide the category control because the route already scopes it (e.g. `/categorias/[slug]`). */
  lockCategory?: boolean;
}

export function Filters({
  className,
  lockPlatform = false,
  lockCategory = false,
}: FiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlState = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [state, setState] = useState<FilterState>(urlState);
  const [minPriceInput, setMinPriceInput] = useState(
    urlState.minPrice === null ? "" : String(urlState.minPrice),
  );
  const [maxPriceInput, setMaxPriceInput] = useState(
    urlState.maxPrice === null ? "" : String(urlState.maxPrice),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Re-sync from the URL on load and on back/forward navigation (R16.4).
  useEffect(() => {
    setState(urlState);
    setMinPriceInput(urlState.minPrice === null ? "" : String(urlState.minPrice));
    setMaxPriceInput(urlState.maxPrice === null ? "" : String(urlState.maxPrice));
  }, [urlState]);

  const apply = useCallback(
    (next: FilterState) => {
      setState(next);
      const query = buildQueryString(new URLSearchParams(searchParams.toString()), next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const onPlatform = useCallback(
    (value: string) => apply({ ...state, platform: (value || null) as OfferPlatform | null }),
    [apply, state],
  );
  const onCategory = useCallback(
    (value: string) => apply({ ...state, category: value || null }),
    [apply, state],
  );
  const onMinDiscount = useCallback(
    (value: string) => apply({ ...state, minDiscount: value === "" ? null : Number(value) }),
    [apply, state],
  );
  const onSort = useCallback(
    (value: string) => apply({ ...state, sort: value as OfferSort }),
    [apply, state],
  );
  const onApplyPrice = useCallback(() => {
    const nextMin = minPriceInput.trim() === "" ? null : Number(minPriceInput);
    const nextMax = maxPriceInput.trim() === "" ? null : Number(maxPriceInput);
    apply({
      ...state,
      minPrice: nextMin !== null && Number.isFinite(nextMin) ? nextMin : null,
      maxPrice: nextMax !== null && Number.isFinite(nextMax) ? nextMax : null,
    });
  }, [apply, maxPriceInput, minPriceInput, state]);
  const onClear = useCallback(() => {
    setMinPriceInput("");
    setMaxPriceInput("");
    // Preserve any free-text search; only reset the structured filters.
    apply({ ...DEFAULT_FILTER_STATE, query: state.query });
  }, [apply, state.query]);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerOpen, drawerRef, closeDrawer);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const formProps: FiltersFormProps = {
    state,
    minPriceInput,
    maxPriceInput,
    lockPlatform,
    lockCategory,
    onPlatform,
    onCategory,
    onMinDiscount,
    onSort,
    onMinPriceInput: setMinPriceInput,
    onMaxPriceInput: setMaxPriceInput,
    onApplyPrice,
    onClear,
  };

  return (
    <div className={className}>
      {/* Desktop: inline controls */}
      <div className="hidden md:block">
        <FiltersForm {...formProps} />
      </div>

      {/* Mobile: open the controls in a drawer (R17.2) */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2.5 text-body font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          Filtros
        </button>

        {drawerOpen ? (
          <DrawerShell onClose={closeDrawer} containerRef={drawerRef}>
            <FiltersForm {...formProps} />
          </DrawerShell>
        ) : null}
      </div>
    </div>
  );
}

interface DrawerShellProps {
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/** Accessible bottom-sheet drawer used on mobile (R17.2, R25.4). */
function DrawerShell({ onClose, containerRef, children }: DrawerShellProps) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-border bg-surface p-5 outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h6 font-semibold text-foreground">Filtros</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar filtros"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
