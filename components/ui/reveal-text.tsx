"use client";

import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

import { transition } from "@/lib/ui/motion";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

/**
 * `RevealText` — own, LCP-safe H1 reveal (Task 32.2 / R18.2, R18.5, R18.6).
 *
 * An honest adaptation of React Bits' "Blur Text" / "Split Text" (see
 * `docs/react-bits-research.md`). No React Bits code is copied; this is built
 * on `lib/ui/motion` + {@link useReducedMotion}.
 *
 * Key guarantees:
 * - **LCP-safe (R18.6):** the children are real, server-rendered text that is
 *   present and fully readable on the very first paint. The enhancement is a
 *   transform-only rise applied *after* hydration, so the H1/LCP is never gated
 *   behind motion and never starts invisible.
 * - **Transform-only (R18.2):** animates only `transform: translateY` — no
 *   `filter: blur` (which "Blur Text" uses) and no layout properties. Opacity is
 *   held at 1 throughout, so the text never disappears (no hydration blink).
 * - **No-op under reduced motion (R18.5):** when the user prefers reduced
 *   motion, the static markup is rendered and no animation ever runs.
 * - **Responsive-safe (R17.1):** renders a block-level wrapper so the text keeps
 *   wrapping normally; it does not split the heading into `inline-block` chunks.
 *
 * Server/first-client render and the reduced-motion render are byte-identical
 * (a plain `<span style="display:block">`), so there is no hydration mismatch
 * and no layout shift when the effect upgrades on mount.
 */
export interface RevealTextProps {
  /** The real, readable heading content (rendered server-side for LCP). */
  children: ReactNode;
  /** Vertical rise distance for the entrance, in px. Kept subtle. */
  rise?: number;
  className?: string;
}

const DEFAULT_RISE = 12;

export function RevealText({ children, rise = DEFAULT_RISE, className }: RevealTextProps) {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // First paint (SSR + first client render) and reduced-motion: static, fully
  // visible markup. This is the LCP element — present and readable immediately.
  if (!mounted || reducedMotion) {
    return (
      <span className={className} style={{ display: "block" }}>
        {children}
      </span>
    );
  }

  // Post-hydration progressive enhancement: a subtle, transform-only rise.
  return (
    <motion.span
      className={className}
      style={{ display: "block" }}
      initial={{ transform: `translateY(${rise}px)` }}
      animate={{ transform: "translateY(0px)" }}
      transition={transition("editorial")}
    >
      {children}
    </motion.span>
  );
}
