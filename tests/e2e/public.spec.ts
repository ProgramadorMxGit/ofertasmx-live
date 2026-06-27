import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { SEED_OFFERS } from "../fixtures/offers";

/**
 * Public site e2e (Task 38.2 / R29.3): load home, filter, search, open a detail
 * page, share, toggle theme and mobile navigation — plus in-page axe audits for
 * accessibility (R25, including contrast which jsdom cannot check). Everything
 * runs against the deterministic mock Supabase dataset (no real bot/DB).
 */

const AMAZON_OFFER = SEED_OFFERS[0]; // "Audífonos…" (Amazon, featured)
const ML_OFFER = SEED_OFFERS[1]; // "Licuadora…" (Mercado Libre)

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("public site", () => {
  test("home loads with hero and the live offers feed", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /Ofertas reales/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ofertas apareciendo ahora" }),
    ).toBeVisible();
    // SSR-seeded offers render without any client fetch.
    await expect(page.getByText(AMAZON_OFFER.title).first()).toBeVisible();
  });

  test("filtering by platform narrows the listing", async ({ page }) => {
    await page.goto("/ofertas");
    // Gate on client hydration: once the live feed is "En vivo", the Filters
    // onChange handler is attached, so selecting a platform updates the URL.
    await expect(page.getByRole("status").getByText("En vivo")).toBeVisible();
    await expect(page.getByText(AMAZON_OFFER.title).first()).toBeVisible();

    await page.getByLabel("Plataforma").selectOption("mercado_libre");

    await expect(page).toHaveURL(/platform=mercado_libre/);
    await expect(page.getByText(ML_OFFER.title).first()).toBeVisible();
    await expect(page.getByText(AMAZON_OFFER.title)).toHaveCount(0);
  });

  test("search finds an offer and opens its detail page", async ({ page }) => {
    await page.goto("/ofertas");

    // Open the command palette via its trigger (a button; the header's "Buscar"
    // is a link, so the role disambiguates). The "/" / Ctrl+K shortcuts are
    // covered by the component's unit logic.
    await page.getByRole("button", { name: "Buscar ofertas" }).click();
    const search = page.getByRole("dialog", { name: "Buscar ofertas" });
    await expect(search).toBeVisible();

    await page.getByLabel("Término de búsqueda").fill("Licuadora");
    const result = search.getByRole("link", { name: /Licuadora/i });
    await expect(result).toBeVisible();
    await result.click();

    await expect(page).toHaveURL(new RegExp(`/ofertas/${ML_OFFER.slug}`));
    await expect(page.getByRole("heading", { level: 1, name: ML_OFFER.title })).toBeVisible();
  });

  test("detail page shows breadcrumbs and the affiliate CTA", async ({ page }) => {
    await page.goto(`/ofertas/${AMAZON_OFFER.slug}`);

    await expect(page.getByRole("navigation", { name: "Migas de pan" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: AMAZON_OFFER.title })).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(`Ver oferta en Amazon`, "i") }),
    ).toBeVisible();
  });

  test("share falls back to copying the link to the clipboard", async ({ page }) => {
    // Stub the Web Share + Clipboard APIs deterministically before any script runs.
    await page.addInitScript(() => {
      // Force the clipboard fallback path by removing native share.
      // @ts-expect-error - intentionally deleting an optional API for the test.
      delete navigator.share;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    });

    await page.goto(`/ofertas/${AMAZON_OFFER.slug}`);
    // Let hydration settle (the detail page's client islands mount) before the click.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: new RegExp(`Compartir`, "i") }).first().click();

    await expect(page.getByRole("button", { name: "Enlace copiado" })).toBeVisible();
  });

  test("theme toggle flips data-theme and persists across reloads", async ({ page }) => {
    await page.goto("/");
    // Gate on hydration so the toggle's click handler is attached.
    await expect(page.getByRole("status").getByText("En vivo")).toBeVisible();

    const html = page.locator("html");
    const initial = await html.getAttribute("data-theme");
    const expectedNext = initial === "light" ? "dark" : "light";

    await page.getByRole("button", { name: "Cambiar entre tema claro y oscuro" }).first().click();
    await expect(html).toHaveAttribute("data-theme", expectedNext);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", expectedNext);
  });

  test.describe("mobile navigation drawer", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("opens, traps focus and closes with Escape", async ({ page }) => {
      await page.goto("/");
      // Gate on hydration so the header's menu button is interactive.
      await expect(page.getByRole("status").getByText("En vivo")).toBeVisible();

      const openButton = page.getByRole("button", { name: "Abrir menú" });
      await openButton.click();

      const drawer = page.getByRole("dialog", { name: "Menú de navegación" });
      await expect(drawer).toBeVisible();
      // Focus moved into the drawer (focus trap, R25.4).
      await expect(drawer).toContainText("Menú");

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      // Focus is restored to the trigger.
      await expect(openButton).toBeFocused();
    });
  });

  test.describe("accessibility (axe) on live pages", () => {
    for (const path of ["/", "/ofertas", `/ofertas/${AMAZON_OFFER.slug}`]) {
      test(`no WCAG violations on ${path}`, async ({ page }) => {
        await page.goto(path);
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
});
