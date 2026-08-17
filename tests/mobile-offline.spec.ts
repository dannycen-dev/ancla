import { expect, test } from "@playwright/test";
import { loginPage, resetTodayLog } from "./helpers.ts";

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test.describe("iPhone Safari offline", () => {
  test("si la API cae pero hay caché, no manda al login", async ({ page }) => {
    await loginPage(page);
    await expect(page.getByRole("button", { name: /Plan alimenticio/i })).toBeVisible();

    await page.route("**/api/me", (route) => route.abort());
    await page.route("**/api/plan", (route) => route.abort());
    await page.reload();

    await expect(page.getByRole("button", { name: /Plan de entrenamiento/i })).toBeVisible();
    await expect(page.getByText(/Sin conexión|última versión/i)).toBeVisible();
  });

  test("marcar comida sin red se sube al reconectar", async ({ page, context }) => {
    await loginPage(page);
    await resetTodayLog(page);
    await page.getByRole("button", { name: /Plan alimenticio/i }).click();
    await expect(page.getByRole("button", { name: "Hoy", exact: true })).toBeVisible();
    await expect(page.locator("main.page")).not.toHaveAttribute("aria-busy", "true");

    await context.setOffline(true);
    const mark = page.getByRole("button", { name: "Marcar", exact: true }).first();
    await expect(mark).toBeVisible();
    await mark.click();
    await expect(page.getByRole("button", { name: "Hecho", exact: true }).first()).toBeVisible();
    await expect(page.getByText(/cambios en este teléfono/i)).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const date = todayIso();
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/day/${date}`);
        if (!response.ok()) return 0;
        const body = (await response.json()) as {
          log?: { doneSlotIds?: string[]; waterHalves?: number; zeroCalDrink?: boolean };
        };
        return (body.log?.doneSlotIds?.length ?? 0) + (body.log?.waterHalves ?? 0) + (body.log?.zeroCalDrink ? 1 : 0);
      })
      .toBeGreaterThan(0);
  });

  test("Salir sin red no borra el plan ni reentra solo", async ({ page, context }) => {
    await loginPage(page);
    await expect(page.getByRole("button", { name: /Plan alimenticio/i })).toBeVisible();

    await context.setOffline(true);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page.getByRole("heading", { name: /Tu plan, a la mano/i })).toBeVisible();

    const hasPlan = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const request = indexedDB.open("ancla");
          request.onerror = () => resolve(false);
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("cache")) {
              resolve(false);
              return;
            }
            const tx = db.transaction("cache", "readonly");
            const get = tx.objectStore("cache").get("plan");
            get.onsuccess = () => resolve(Boolean(get.result));
            get.onerror = () => resolve(false);
          };
        }),
    );
    expect(hasPlan).toBe(true);

    await context.setOffline(false);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Tu plan, a la mano/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Plan de entrenamiento/i })).toHaveCount(0);
  });
});
