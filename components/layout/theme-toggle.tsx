"use client";

import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils/cn";

type Theme = "light" | "dark";

/**
 * ThemeToggle (Task 20.3 / R12.3).
 *
 * Flips `data-theme` on <html> and persists the choice to localStorage. The
 * FOUC-safe inline script in the root layout applies the stored/system theme
 * before paint, so this control only needs to *change* it on click.
 *
 * The glyph is swapped purely in CSS off `data-theme` (see globals.css), so the
 * button carries no theme-dependent render state and can never cause a
 * hydration mismatch. Icons are decorative; the accessible name is static.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function handleToggle(): void {
    const root = document.documentElement;
    const next: Theme =
      root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    root.style.colorScheme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Persistence is best-effort (e.g. blocked storage); the toggle still works.
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar tema"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border",
        "bg-surface text-foreground transition-colors duration-fast ease-emphasized",
        "hover:bg-surface-elevated focus-visible:outline-none",
        className,
      )}
    >
      <Moon
        data-theme-icon="moon"
        aria-hidden="true"
        className="h-5 w-5"
        strokeWidth={1.75}
      />
      <Sun
        data-theme-icon="sun"
        aria-hidden="true"
        className="h-5 w-5"
        strokeWidth={1.75}
      />
    </button>
  );
}
