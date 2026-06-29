"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

/**
 * `BorderGlow` — cursor-following border glow for every {@link OfferCard}.
 *
 * An honest adaptation of React Bits' "Border Glow" (see
 * `docs/react-bits-research.md`); no React Bits code is copied. It follows the
 * same gated client-island pattern as {@link PremiumSpotlight}: an
 * absolutely-positioned, `aria-hidden`, pointer-events-none `<span>` rendered
 * **inside** the (Server) `OfferCard`. It attaches pointer listeners to its
 * parent card, derives two values from the pointer — the proximity to the
 * nearest edge and the angle from the card centre — and writes them to CSS
 * custom properties (`--bg-opacity`, `--bg-angle`), throttled with
 * `requestAnimationFrame` (R18.3). A conic mask reveals an inset glow ring only
 * on the border segment nearest the cursor, so the edge "lights up" as the
 * pointer approaches it.
 *
 * Tokenised + on-brand: the glow uses the single `--primary` colour (never the
 * rainbow mesh), so it stays consistent with the minimalist identity. Animates
 * only `opacity` and a `mask` angle — never layout (R18.2). Fully gated: enabled
 * only for a precise pointer with reduced-motion off and `Save-Data` off; when
 * the gate is closed it renders nothing and attaches no listeners (R18.5,
 * R17.3), so touch and reduced-motion users keep the card unchanged.
 */

/** Non-standard `navigator.connection.saveData`, typed narrowly (no `any`). */
interface NavigatorConnection {
  readonly saveData?: boolean;
}
interface NavigatorWithConnection extends Navigator {
  readonly connection?: NavigatorConnection;
}

/** Below this edge proximity (0 centre → 1 edge) the glow stays hidden. */
const EDGE_SENSITIVITY = 0.12;
/** Peak glow opacity at the very edge. Kept subtle for a deals grid. */
const MAX_OPACITY = 0.8;

export function BorderGlow() {
  const reducedMotion = useReducedMotion();
  const [pointerFine, setPointerFine] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const overlayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(pointer: fine)");
    setPointerFine(query.matches);
    const onChange = (event: MediaQueryListEvent): void => setPointerFine(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const nav = navigator as NavigatorWithConnection;
    setSaveData(nav.connection?.saveData === true);
  }, []);

  const enabled = pointerFine && !reducedMotion && !saveData;

  useEffect(() => {
    if (!enabled) return;
    const overlay = overlayRef.current;
    const card = overlay?.parentElement;
    if (!overlay || !card) return;

    let rafId = 0;
    let nextAngle = 0;
    let nextOpacity = 0;

    const flush = (): void => {
      rafId = 0;
      overlay.style.setProperty("--bg-angle", `${nextAngle.toFixed(2)}deg`);
      overlay.style.setProperty("--bg-opacity", nextOpacity.toFixed(3));
    };

    const onMove = (event: PointerEvent): void => {
      const rect = card.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = event.clientX - rect.left - cx;
      const dy = event.clientY - rect.top - cy;

      // Edge proximity in [0, 1]: 0 at the centre, 1 on the nearest edge.
      const kx = dx === 0 ? Infinity : cx / Math.abs(dx);
      const ky = dy === 0 ? Infinity : cy / Math.abs(dy);
      const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);

      // Direction centre → cursor, aligned to a CSS `conic-gradient` (0deg = up).
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;

      nextAngle = angle;
      nextOpacity =
        edge <= EDGE_SENSITIVITY
          ? 0
          : ((edge - EDGE_SENSITIVITY) / (1 - EDGE_SENSITIVITY)) * MAX_OPACITY;

      if (rafId === 0) rafId = requestAnimationFrame(flush);
    };

    const onLeave = (): void => {
      nextOpacity = 0;
      if (rafId === 0) rafId = requestAnimationFrame(flush);
    };

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <span
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        opacity: "var(--bg-opacity, 0)",
        transition: "opacity var(--duration-normal) var(--ease-emphasized)",
        // Inset glow ring in the brand primary — layered for a soft falloff.
        boxShadow:
          "inset 0 0 0 1px hsl(var(--primary) / 0.75)," +
          " inset 0 0 6px 0 hsl(var(--primary) / 0.40)," +
          " inset 0 0 14px 0 hsl(var(--primary) / 0.22)",
        // Reveal only the ~border arc nearest the cursor (wedge centred on the
        // pointer angle; the conic wraps so 0%/100% is the cursor direction).
        WebkitMaskImage:
          "conic-gradient(from var(--bg-angle, 0deg) at 50% 50%, #000 0%, #000 12%, transparent 30%, transparent 70%, #000 88%, #000 100%)",
        maskImage:
          "conic-gradient(from var(--bg-angle, 0deg) at 50% 50%, #000 0%, #000 12%, transparent 30%, transparent 70%, #000 88%, #000 100%)",
      }}
    />
  );
}
