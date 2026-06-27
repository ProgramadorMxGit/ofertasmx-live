"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { computeMagnetOffset } from "@/lib/ui/magnet";
import { EASE_EMPHASIZED, DURATION } from "@/lib/ui/motion";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

/**
 * `Magnet` — own, desktop-only subtle magnet wrapper (Task 32.2 / R18.2, R18.3,
 * R18.5). An honest adaptation of React Bits' "Magnet" (see
 * `docs/react-bits-research.md`); no React Bits code is copied.
 *
 * While a **precise pointer** hovers the wrapper, its content is nudged a few
 * pixels toward the cursor using the pure {@link computeMagnetOffset} geometry,
 * applied as a `transform` only (R18.2) and throttled with
 * `requestAnimationFrame` (R18.3). On leave it eases back to rest.
 *
 * Fully gated — the effect is enabled **iff** the pointer is fine
 * (`(pointer: fine)`, i.e. desktop-class), the user has not requested reduced
 * motion, and `Save-Data` is off. When the gate is closed it renders the
 * children in a plain wrapper, attaches no listeners and applies no transform,
 * so touch users (R17.3) and reduced-motion users (R18.5) keep full
 * functionality with zero motion cost.
 */
export interface MagnetProps {
  children: ReactNode;
  /** Fraction of the center→pointer vector applied (0..1). */
  strength?: number;
  /** Maximum absolute translation per axis, in px. Kept subtle. */
  maxTranslate?: number;
  className?: string;
}

/** Non-standard `navigator.connection.saveData`, typed narrowly (no `any`). */
interface NavigatorConnection {
  readonly saveData?: boolean;
}
interface NavigatorWithConnection extends Navigator {
  readonly connection?: NavigatorConnection;
}

const DEFAULT_STRENGTH = 0.35;
const DEFAULT_MAX_TRANSLATE = 6;

export function Magnet({
  children,
  strength = DEFAULT_STRENGTH,
  maxTranslate = DEFAULT_MAX_TRANSLATE,
  className,
}: MagnetProps) {
  const reducedMotion = useReducedMotion();
  const [pointerFine, setPointerFine] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

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
    const wrapper = wrapperRef.current;
    if (!enabled || !wrapper) return;

    let rafId = 0;
    let nextX = 0;
    let nextY = 0;

    const flush = (): void => {
      rafId = 0;
      wrapper.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    };
    const schedule = (): void => {
      if (rafId === 0) rafId = requestAnimationFrame(flush);
    };

    const onMove = (event: PointerEvent): void => {
      const rect = wrapper.getBoundingClientRect();
      const offset = computeMagnetOffset({
        pointerX: event.clientX,
        pointerY: event.clientY,
        rect,
        strength,
        maxTranslate,
      });
      nextX = offset.x;
      nextY = offset.y;
      schedule();
    };
    const onLeave = (): void => {
      nextX = 0;
      nextY = 0;
      schedule();
    };

    wrapper.addEventListener("pointermove", onMove);
    wrapper.addEventListener("pointerleave", onLeave);
    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      wrapper.removeEventListener("pointermove", onMove);
      wrapper.removeEventListener("pointerleave", onLeave);
      wrapper.style.transform = "";
    };
  }, [enabled, strength, maxTranslate]);

  if (!enabled) {
    return (
      <span ref={wrapperRef} className={className} style={{ display: "inline-flex" }}>
        {children}
      </span>
    );
  }

  return (
    <span
      ref={wrapperRef}
      className={className}
      style={{
        display: "inline-flex",
        willChange: "transform",
        transition: `transform ${DURATION.fast}ms ${EASE_EMPHASIZED}`,
      }}
    >
      {children}
    </span>
  );
}
