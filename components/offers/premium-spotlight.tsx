"use client";

import { useEffect, useRef, useState } from "react";

import {
  shouldEnablePremiumEffect,
  type PremiumEffectConditions,
} from "@/lib/ui/premium-effects";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

/**
 * Thin Client island that applies the premium-effect gate (R14.4, R14.5).
 *
 * It reads the three runtime signals the pure gate needs — precise pointer
 * (`(pointer: fine)`), reduced-motion preference and `Save-Data` — combines
 * them with the server-provided `isFeatured`/`isFirstRow`, and only when
 * {@link shouldEnablePremiumEffect} returns `true` renders a decorative,
 * cursor-following spotlight + border glow.
 *
 * Rendered as an absolutely-positioned, `aria-hidden`, pointer-events-none
 * sibling **inside** the (Server) `OfferCard`, so the card itself stays a
 * Server Component. It attaches pointer listeners to its parent card element,
 * updates only CSS custom properties (driving `opacity`/`background` — never
 * layout, R18.2), and throttles with `requestAnimationFrame` (R18.3). When the
 * gate is closed it renders nothing and attaches no listeners.
 */
export interface PremiumSpotlightProps {
  isFeatured: boolean;
  isFirstRow: boolean;
}

/** Non-standard `navigator.connection.saveData`, typed narrowly (no `any`). */
interface NavigatorConnection {
  readonly saveData?: boolean;
}
interface NavigatorWithConnection extends Navigator {
  readonly connection?: NavigatorConnection;
}

export function PremiumSpotlight({ isFeatured, isFirstRow }: PremiumSpotlightProps) {
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

  const conditions: PremiumEffectConditions = {
    isFeatured,
    isFirstRow,
    pointerFine,
    reducedMotion,
    saveData,
  };
  const enabled = shouldEnablePremiumEffect(conditions);

  useEffect(() => {
    if (!enabled) return;
    const overlay = overlayRef.current;
    const card = overlay?.parentElement;
    if (!overlay || !card) return;

    let rafId = 0;
    let nextX = 0;
    let nextY = 0;

    const flush = (): void => {
      rafId = 0;
      overlay.style.setProperty("--spot-x", `${nextX}px`);
      overlay.style.setProperty("--spot-y", `${nextY}px`);
    };
    const onMove = (event: PointerEvent): void => {
      const rect = card.getBoundingClientRect();
      nextX = event.clientX - rect.left;
      nextY = event.clientY - rect.top;
      if (rafId === 0) rafId = requestAnimationFrame(flush);
    };
    const onEnter = (): void => overlay.style.setProperty("--spot-opacity", "1");
    const onLeave = (): void => overlay.style.setProperty("--spot-opacity", "0");

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointerleave", onLeave);
    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerenter", onEnter);
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
        opacity: "var(--spot-opacity, 0)",
        transition: "opacity var(--duration-normal) var(--ease-emphasized)",
        background:
          "radial-gradient(240px circle at var(--spot-x, 50%) var(--spot-y, 0%), hsl(var(--primary) / 0.18), transparent 60%)",
        boxShadow: "inset 0 0 0 1px hsl(var(--primary) / 0.35)",
      }}
    />
  );
}
