import { expect, test } from "@playwright/test";

import { E2E_ADMIN_EMAIL } from "./support/config";
import { setAdminSession } from "./support/fixtures";
import { SEED_OFFERS } from "../fixtures/offers";

/**
 * Admin e2e (Task 38.2 / R29.3): sign in as an allowlisted admin (mocked
 * Supabase auth + session cookie so `middleware.ts` admits a test admin), edit
 * an offer and expire an offer. All admin writes hit `/api/admin/offers`, which
 * is intercepted so nothing touches the real database or service-role key.
 */

const OFFER = SEED_OFFERS[0];

test.describe("admin panel", () => {
  test.beforeEach(async ({ context }) => {
    await setAdminSession(context);
  });

  test("an allowlisted admin reaches the dashboard", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
    await expect(page.getByText(`Sesión: ${E2E_ADMIN_EMAIL}`)).toBeVisible();
  });

  test("editing an offer saves through the admin API", async ({ page }) => {
    // Intercept the admin write so no real DB / service-role key is used.
    let editBody: unknown = null;
    await page.route("**/api/admin/offers", async (route) => {
      editBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(`/admin/ofertas/${OFFER.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Editar oferta" })).toBeVisible();

    await page.getByLabel("Título").fill("Título editado por la prueba e2e");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByText("Cambios guardados.")).toBeVisible();
    expect(editBody).toMatchObject({ action: "edit", offerId: OFFER.id });
  });

  test("expiring an offer posts the expire action", async ({ page }) => {
    const actions: string[] = [];
    await page.route("**/api/admin/offers", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      if (typeof body?.action === "string") actions.push(body.action);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(`/admin/ofertas/${OFFER.id}`);
    await page.getByRole("button", { name: "Expirar" }).click();

    await expect(page.getByText("Oferta expirada.")).toBeVisible();
    expect(actions).toContain("expire");
  });
});
