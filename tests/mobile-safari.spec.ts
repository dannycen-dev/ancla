import { expect, test } from "@playwright/test";
import { loginPage } from "./helpers.ts";

test.describe("iPhone Safari", () => {
  test("login, hub, gym y RM caben y responden al tap", async ({ page }) => {
    await loginPage(page);

    await expect(page.getByRole("button", { name: /Plan alimenticio/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Recargar app" })).toBeVisible();
    await page.getByRole("button", { name: "Contraseña" }).click();
    await expect(page.getByLabel(/^Nueva contraseña$/i)).toBeVisible();
    await expect(page.getByLabel(/Confirmar nueva/i)).toBeVisible();
    await expect(page.getByLabel(/Contraseña actual/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: /Plan de entrenamiento/i }).click();

    await expect(page.getByRole("button", { name: "Hoy", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "RM", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inicio" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: "RM", exact: true }).click();
    await expect(page.getByRole("heading", { name: /repetición máxima/i })).toBeVisible();
    await page.getByPlaceholder("kg").fill("80");
    await page.getByPlaceholder("1–10").fill("5");
    await page.getByRole("button", { name: /Calcular/i }).click();
    await expect(page.getByRole("heading", { name: /Repetición máxima \(\d+ kg\)/i })).toBeVisible();

    await page.getByRole("button", { name: "Hoy", exact: true }).click();
    const startClock = page.getByLabel(/Hora en que inicié/i);
    if (await startClock.count()) {
      await startClock.fill("07:30");
      await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
      await page.getByRole("button", { name: "Cancelar" }).click();
      await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);
      await startClock.fill("07:30");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(startClock).toHaveValue(/07:30/);
    }
    const gymOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(gymOverflow).toBeLessThanOrEqual(2);

    const timer = page.getByRole("button", { name: "Iniciar" }).first();
    if (await timer.count()) {
      await timer.click();
      await expect(page.getByRole("button", { name: "Pausa" }).first()).toBeVisible();
    }
  });

  test("comida abre el día sin desbordar", async ({ page }) => {
    await loginPage(page);
    await page.getByRole("button", { name: /Plan alimenticio/i }).click();
    await expect(page.getByRole("button", { name: "Hoy", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("contraseña incorrecta no entra", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Contraseña").fill("no-es-esta");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText(/Contraseña incorrecta|No se pudo/i)).toBeVisible();
  });

  test("cambiar de día no pega las marcas del día anterior", async ({ page }) => {
    await loginPage(page);
    await page.getByRole("button", { name: /Plan alimenticio/i }).click();
    await expect(page.locator("main.page")).not.toHaveAttribute("aria-busy", "true");
    const slot = page.getByRole("heading", { name: "Probióticos" }).locator("xpath=ancestor::section[1]");
    await expect(slot.getByRole("button", { name: "Marcar", exact: true })).toBeVisible();
    await slot.getByRole("button", { name: "Marcar", exact: true }).click();
    await expect(slot.getByRole("button", { name: "Hecho", exact: true })).toBeVisible();

    const week = page.getByRole("navigation", { name: "Día de la semana" });
    await week.getByRole("button").filter({ hasNotText: /hoy/i }).first().click();
    await expect(page.locator("main.page")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("button", { name: "Marcar", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tu plan, a la mano/i })).toHaveCount(0);

    await week.getByRole("button").filter({ hasText: /hoy/i }).click();
    await expect(page.locator("main.page")).not.toHaveAttribute("aria-busy", "true");
    await expect(slot.getByRole("button", { name: "Hecho", exact: true })).toBeVisible();
  });

  test("RM sobrevive al volver al hub", async ({ page }) => {
    await loginPage(page);
    await page.getByRole("button", { name: /Plan de entrenamiento/i }).click();
    await page.getByRole("button", { name: "RM", exact: true }).click();
    await page.getByPlaceholder("kg").fill("80");
    await page.getByPlaceholder("1–10").fill("5");
    await page.getByRole("button", { name: /Calcular/i }).click();
    await expect(page.getByRole("heading", { name: /Repetición máxima \(90 kg\)/i })).toBeVisible();
    await page.getByRole("button", { name: "Inicio" }).click();
    await page.getByRole("button", { name: /Plan de entrenamiento/i }).click();
    await page.getByRole("button", { name: "RM", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Repetición máxima \(90 kg\)/i })).toBeVisible();
  });

  test("actualizar.html recarga el inicio", async ({ page }) => {
    await page.goto("/actualizar.html");
    await expect(page.getByRole("heading", { name: /Tu plan, a la mano/i })).toBeVisible();
  });

  test("actualizar.html no se queda si el service worker no responde", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { getRegistrations: () => new Promise(() => undefined) },
      });
    });
    await page.goto("/actualizar.html");
    await expect(page.getByRole("link", { name: "Entrar a Ancla" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tu plan, a la mano/i })).toBeVisible({ timeout: 8_000 });
  });
});
