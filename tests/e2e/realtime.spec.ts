import { expect, test } from "@playwright/test";

import { REALTIME_INSERT_OFFER, SEED_OFFERS, makePublicOffer } from "../fixtures/offers";
import {
  injectRealtimeExpire,
  injectRealtimeInsert,
  injectRealtimeUpdate,
} from "./support/fixtures";

/**
 * Simulated-realtime e2e (Task 38.2 / R29.3, R9): a new card appears WITHOUT a
 * reload, an update patches in place, and an expiry removes the card. Events are
 * injected deterministically through the app's `NEXT_PUBLIC_E2E` seam — no real
 * Supabase Realtime channel and no credentials are involved (R29.4).
 */

const ML_OFFER = SEED_OFFERS[1];

test.describe("realtime feed", () => {
  test("a simulated INSERT shows a new card without reloading", async ({ page }) => {
    await page.goto("/ofertas");

    // The seam marks the feed live once mounted.
    await expect(page.getByRole("status").getByText("En vivo")).toBeVisible();
    await expect(page.getByText(REALTIME_INSERT_OFFER.title)).toHaveCount(0);

    await injectRealtimeInsert(page, REALTIME_INSERT_OFFER);

    // New card is present and the discreet polite notice is shown (R9.2) — and
    // no navigation happened (still on /ofertas).
    await expect(page.getByText(REALTIME_INSERT_OFFER.title)).toBeVisible();
    await expect(page.getByText("Nueva oferta encontrada")).toBeVisible();
    await expect(page).toHaveURL(/\/ofertas$/);
  });

  test("a simulated UPDATE patches the price in place", async ({ page }) => {
    await page.goto("/ofertas");
    // Wait until the realtime seam is ready (listener attached) before injecting.
    await expect(page.getByRole("status").getByText("En vivo")).toBeVisible();
    await expect(page.getByText(ML_OFFER.title).first()).toBeVisible();

    const updated = makePublicOffer({
      ...ML_OFFER,
      current_price: 1499.0,
      discount_percent: 40,
      updated_at: "2024-06-01T12:10:00.000Z",
    });
    await injectRealtimeUpdate(page, updated);

    // The patched price is rendered (grouping separator from es-MX formatting).
    await expect(page.getByText(/1,499/).first()).toBeVisible();
  });

  test("a simulated expiry removes the offer from the feed", async ({ page }) => {
    await page.goto("/ofertas");
    await expect(page.getByRole("status").getByText("En vivo")).toBeVisible();
    await expect(page.getByText(ML_OFFER.title).first()).toBeVisible();

    await injectRealtimeExpire(page, ML_OFFER);

    await expect(page.getByText(ML_OFFER.title)).toHaveCount(0);
  });
});
