import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { APP_PASSWORD } from "../playwright.config.ts";

export function requirePassword(): string {
  if (!APP_PASSWORD) {
    throw new Error("Falta APP_PASSWORD en .dev.vars o ANCLA_PASSWORD en el entorno.");
  }
  return APP_PASSWORD;
}

export async function loginPage(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Tu plan, a la mano/i })).toBeVisible();
  await page.getByLabel("Contraseña").fill(requirePassword());
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: /Plan de entrenamiento/i })).toBeVisible({
    timeout: 20_000,
  });
}

export async function loginApi(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/login", {
    data: { password: requirePassword() },
  });
  expect(response.ok()).toBeTruthy();
}
