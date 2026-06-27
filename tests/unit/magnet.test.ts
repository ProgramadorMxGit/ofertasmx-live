import { describe, expect, it } from "vitest";

import {
  computeMagnetOffset,
  NO_OFFSET,
  type MagnetRect,
} from "@/lib/ui/magnet";

/**
 * Unit tests for the magnet geometry (Task 32.2 / R18.2, R18.3).
 *
 * `computeMagnetOffset` is pure: it maps a pointer position + element rect +
 * strength + clamp into a transform-only `{x, y}` translation pointing toward
 * the cursor and clamped to `±maxTranslate`. These examples cover the center,
 * clamping, the disabling parameters and direction; the wiring/DOM lives in the
 * `Magnet` client component.
 */

/** A 100x40 element with its center at (150, 120). */
const RECT: MagnetRect = { left: 100, top: 100, width: 100, height: 40 };
const CENTER_X = 150;
const CENTER_Y = 120;

describe("computeMagnetOffset", () => {
  it("returns no movement when the pointer is at the element center", () => {
    expect(
      computeMagnetOffset({
        pointerX: CENTER_X,
        pointerY: CENTER_Y,
        rect: RECT,
        strength: 0.35,
        maxTranslate: 6,
      }),
    ).toEqual(NO_OFFSET);
  });

  it("pulls toward the pointer, scaled by strength, when within the clamp", () => {
    // 20px right, 10px below center; strength 0.5 -> (10, 5), under the clamp.
    expect(
      computeMagnetOffset({
        pointerX: CENTER_X + 20,
        pointerY: CENTER_Y + 10,
        rect: RECT,
        strength: 0.5,
        maxTranslate: 6,
      }),
    ).toEqual({ x: 6, y: 5 });
  });

  it("clamps the offset to ±maxTranslate on each axis", () => {
    const offset = computeMagnetOffset({
      pointerX: CENTER_X + 1000,
      pointerY: CENTER_Y - 1000,
      rect: RECT,
      strength: 1,
      maxTranslate: 6,
    });
    expect(offset).toEqual({ x: 6, y: -6 });
  });

  it("keeps the sign pointing toward the cursor (up-left -> negative)", () => {
    const offset = computeMagnetOffset({
      pointerX: CENTER_X - 8,
      pointerY: CENTER_Y - 4,
      rect: RECT,
      strength: 0.5,
      maxTranslate: 6,
    });
    expect(offset).toEqual({ x: -4, y: -2 });
  });

  it("returns no movement when strength is 0", () => {
    expect(
      computeMagnetOffset({
        pointerX: CENTER_X + 50,
        pointerY: CENTER_Y + 50,
        rect: RECT,
        strength: 0,
        maxTranslate: 6,
      }),
    ).toEqual(NO_OFFSET);
  });

  it("returns no movement when maxTranslate is 0", () => {
    expect(
      computeMagnetOffset({
        pointerX: CENTER_X + 50,
        pointerY: CENTER_Y + 50,
        rect: RECT,
        strength: 0.5,
        maxTranslate: 0,
      }),
    ).toEqual(NO_OFFSET);
  });

  it("collapses non-finite measurements to no movement", () => {
    expect(
      computeMagnetOffset({
        pointerX: Number.NaN,
        pointerY: 120,
        rect: RECT,
        strength: 0.5,
        maxTranslate: 6,
      }),
    ).toEqual(NO_OFFSET);
  });

  it("clamps strength above 1 to 1 (never overshoots the raw vector)", () => {
    // 4px right of center, strength clamped to 1 -> 4px, under the 6px clamp.
    expect(
      computeMagnetOffset({
        pointerX: CENTER_X + 4,
        pointerY: CENTER_Y,
        rect: RECT,
        strength: 5,
        maxTranslate: 6,
      }),
    ).toEqual({ x: 4, y: 0 });
  });
});
