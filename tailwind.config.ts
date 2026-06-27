import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind config — design system (Task 1 wiring + Task 20 calibration).
 *
 * Color utilities resolve to `hsl(var(--token))`; the calibrated dark/light
 * token values live in `app/globals.css` and switch per `data-theme`.
 * Typography (fluid scale + font families), motion tokens (durations + the
 * emphasized easing) and the keyframes used by the UI (shimmer / fades, which
 * animate only opacity & transform — R18.2) are wired here.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        "focus-ring": "hsl(var(--focus-ring))",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
        serif: [
          "var(--font-serif)",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
      fontSize: {
        meta: ["var(--step--1)", { lineHeight: "1.5" }],
        body: ["var(--step-0)", { lineHeight: "1.65" }],
        h6: ["var(--step-1)", { lineHeight: "1.4" }],
        h5: ["var(--step-2)", { lineHeight: "1.3" }],
        h4: ["var(--step-3)", { lineHeight: "1.25" }],
        h3: ["var(--step-4)", { lineHeight: "1.2" }],
        h2: ["var(--step-5)", { lineHeight: "1.12" }],
        h1: ["var(--step-6)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      transitionDuration: {
        instant: "120ms",
        fast: "190ms",
        normal: "280ms",
        editorial: "520ms",
      },
      transitionTimingFunction: {
        emphasized: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        // Skeleton shimmer — transform-only (R18.2).
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Entrance animations — opacity/transform only (R18.2).
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s var(--ease-emphasized) infinite",
        "fade-in": "fade-in var(--duration-normal) var(--ease-emphasized) both",
        "fade-up": "fade-up var(--duration-normal) var(--ease-emphasized) both",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
