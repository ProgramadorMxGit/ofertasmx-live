import { describe, expect, it } from "vitest";

import {
  DURATION,
  DURATION_S,
  EASE_EMPHASIZED,
  EASE_EMPHASIZED_POINTS,
  prefersReducedMotion,
  transition,
} from "@/lib/ui/motion";

/**
 * Unit tests for the animation system tokens / guards (Task 20.4 / R18).
 * The reduced-motion *hook* needs a DOM and is exercised in the browser; here
 * we cover the framework-agnostic, SSR-safe pieces.
 */

describe("duration tokens fall within the spec ranges (R18.1)", () => {
  it("instant is 100-140ms", () => {
    expect(DURATION.instant).toBeGreaterThanOrEqual(100);
    expect(DURATION.instant).toBeLessThanOrEqual(140);
  });
  it("fast is 160-220ms", () => {
    expect(DURATION.fast).toBeGreaterThanOrEqual(160);
    expect(DURATION.fast).toBeLessThanOrEqual(220);
  });
  it("normal is 240-320ms", () => {
    expect(DURATION.normal).toBeGreaterThanOrEqual(240);
    expect(DURATION.normal).toBeLessThanOrEqual(320);
  });
  it("editorial is 450-650ms", () => {
    expect(DURATION.editorial).toBeGreaterThanOrEqual(450);
    expect(DURATION.editorial).toBeLessThanOrEqual(650);
  });
  it("seconds mirror the millisecond tokens", () => {
    expect(DURATION_S.normal).toBeCloseTo(DURATION.normal / 1000, 5);
    expect(DURATION_S.editorial).toBeCloseTo(DURATION.editorial / 1000, 5);
  });
});

describe("emphasized easing (R18.1)", () => {
  it("exposes the cubic-bezier string", () => {
    expect(EASE_EMPHASIZED).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });
  it("exposes matching control points", () => {
    expect(EASE_EMPHASIZED_POINTS).toEqual([0.22, 1, 0.36, 1]);
  });
});

describe("transition() builds a framer-motion config", () => {
  it("defaults to the normal token", () => {
    expect(transition()).toEqual({
      duration: DURATION_S.normal,
      ease: [0.22, 1, 0.36, 1],
    });
  });
  it("uses the requested duration token", () => {
    expect(transition("fast").duration).toBeCloseTo(0.19, 5);
  });
  it("returns a fresh, mutable ease array each call", () => {
    const a = transition().ease;
    const b = transition().ease;
    expect(a).not.toBe(b);
    expect(a).not.toBe(EASE_EMPHASIZED_POINTS);
  });
});

describe("prefersReducedMotion() is SSR-safe (R18.6)", () => {
  it("returns false without a DOM and never throws", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
