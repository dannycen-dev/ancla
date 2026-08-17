import { expect, test } from "@playwright/test";
import { emptyLog } from "../shared/log.ts";
import { loginApi, requirePassword } from "./helpers.ts";

/** Fecha fija que no es "hoy", para no pisar las marcas de los tests de iPhone. */
const API_DAY = "2026-03-04";
const API_PANTRY = "2026-03-01_2026-03-15";

test.describe("API", () => {
  test("sin sesión responde 401", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(401);
  });

  test("login y me", async ({ request }) => {
    await loginApi(request);
    const me = await request.get("/api/me");
    expect(me.ok()).toBeTruthy();
  });

  test("origin cruzado en POST se rechaza", async ({ request }) => {
    const response = await request.post("/api/login", {
      headers: { Origin: "https://evil.example" },
      data: { password: requirePassword() },
    });
    expect(response.status()).toBe(403);
  });

  test("POST sin Origin se rechaza", async ({ request }) => {
    const response = await request.post("/api/login", {
      headers: { Origin: "" },
      data: { password: requirePassword() },
    });
    expect(response.status()).toBe(403);
  });

  test("PUT día sin sesión responde 401", async ({ request }) => {
    const response = await request.put(`/api/day/${API_DAY}`, {
      data: emptyLog(API_DAY),
    });
    expect(response.status()).toBe(401);
  });

  test("sesión se renueva en /api/me", async ({ request }) => {
    await loginApi(request);
    const first = await request.get("/api/me");
    const second = await request.get("/api/me");
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
  });

  test("rango de 120 días se acepta", async ({ request }) => {
    await loginApi(request);
    const response = await request.get("/api/range?from=2026-01-01&to=2026-04-30");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { logs: unknown[] };
    expect(body.logs).toHaveLength(120);
  });

  test("rango de 121 días se rechaza", async ({ request }) => {
    await loginApi(request);
    const response = await request.get("/api/range?from=2026-01-01&to=2026-05-02");
    expect(response.status()).toBe(400);
  });

  test("JSON enorme de día no se guarda", async ({ request }) => {
    await loginApi(request);
    const huge = await request.put(`/api/day/${API_DAY}`, {
      data: "x".repeat(32_769),
      headers: { "Content-Type": "application/json" },
    });
    expect(huge.status()).toBe(400);
  });

  test("JSON enorme de plan no se guarda", async ({ request }) => {
    await loginApi(request);
    const huge = await request.put("/api/plan", {
      data: "x".repeat(512_001),
      headers: { "Content-Type": "application/json" },
    });
    expect(huge.status()).toBe(400);
  });

  test("JSON enorme de despensa no se guarda", async ({ request }) => {
    await loginApi(request);
    const huge = await request.put(`/api/pantry/${API_PANTRY}`, {
      data: "x".repeat(16_385),
      headers: { "Content-Type": "application/json" },
    });
    expect(huge.status()).toBe(400);
  });

  test("advise con JSON enorme no llama a la IA", async ({ request }) => {
    await loginApi(request);
    const huge = await request.post("/api/advise", {
      data: "x".repeat(2_049),
      headers: { "Content-Type": "application/json" },
    });
    expect(huge.status()).toBe(400);
  });

  test("JSON enorme de loads no borra datos", async ({ request }) => {
    await loginApi(request);
    const before = await request.get("/api/loads");
    expect(before.ok()).toBeTruthy();
    const previous = await before.json();

    const huge = await request.put("/api/loads", {
      data: "x".repeat(200_001),
      headers: { "Content-Type": "application/json" },
    });
    expect(huge.status()).toBe(400);

    const after = await request.get("/api/loads");
    expect(await after.json()).toEqual(previous);
  });

  test("día inválido no se guarda", async ({ request }) => {
    await loginApi(request);
    const response = await request.put(`/api/day/${API_DAY}`, {
      data: { nope: true },
    });
    expect(response.status()).toBe(400);
  });

  test("guardar día válido", async ({ request }) => {
    await loginApi(request);
    const log = { ...emptyLog(API_DAY), waterHalves: 2 };
    const response = await request.put(`/api/day/${API_DAY}`, { data: log });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { log: { waterHalves: number } };
    expect(body.log.waterHalves).toBe(2);
  });

  test("PUT loads con null se rechaza", async ({ request }) => {
    await loginApi(request);
    const response = await request.put("/api/loads", {
      data: "null",
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).toBe(400);
  });

  test("PUT loads con history vacío no borra historial", async ({ request }) => {
    await loginApi(request);
    const seed = await request.put("/api/loads", {
      data: {
        byExercise: {},
        history: [
          {
            date: API_DAY,
            exerciseId: "squat",
            week: 1,
            note: "",
            sets: [{ weight: "100", unit: "kg" }],
          },
        ],
        rms: [
          {
            id: "rm-1",
            name: "Sentadilla",
            date: API_DAY,
            week: 1,
            weight: "100",
            reps: 5,
            unit: "kg",
            estimatedRm: 112,
          },
        ],
      },
    });
    expect(seed.ok()).toBeTruthy();

    const wipe = await request.put("/api/loads", {
      data: { byExercise: {}, history: [], rms: [] },
    });
    expect(wipe.ok()).toBeTruthy();
    const body = (await wipe.json()) as { history: unknown[]; rms: unknown[] };
    expect(body.history.length).toBeGreaterThan(0);
    expect(body.rms.length).toBeGreaterThan(0);
  });

  test("cambiar contraseña con origen cruzado se rechaza", async ({ request }) => {
    await loginApi(request);
    const response = await request.post("/api/password", {
      headers: { Origin: "https://evil.example" },
      data: { next: "otra-clave-ancla" },
    });
    expect(response.status()).toBe(403);
  });

  test("cambiar contraseña exige sesión", async ({ request }) => {
    const response = await request.post("/api/password", {
      data: { next: "nueva-clave-ancla" },
    });
    expect(response.status()).toBe(401);
  });

  test("nueva contraseña corta se rechaza", async ({ request }) => {
    await loginApi(request);
    const response = await request.post("/api/password", {
      data: { next: "corta" },
    });
    expect(response.status()).toBe(400);
  });

  test("la misma contraseña se rechaza", async ({ request }) => {
    await loginApi(request);
    const response = await request.post("/api/password", {
      data: { next: requirePassword() },
    });
    expect(response.status()).toBe(400);
  });

  test("origin cruzado en recuperar se rechaza", async ({ request }) => {
    const response = await request.post("/api/recover", {
      headers: { Origin: "https://evil.example" },
      data: {},
    });
    expect(response.status()).toBe(403);
  });

  test("token de recuperar inválido se rechaza", async ({ request }) => {
    const response = await request.post("/api/recover/reset", {
      data: { token: "token-falso", next: "clave-nueva-ancla" },
    });
    expect(response.status()).toBe(400);
  });

  test("recuperar en local da token y no cambia la clave actual", async ({ request }) => {
    const recover = await request.post("/api/recover", { data: {} });
    expect(recover.ok()).toBeTruthy();
    const body = (await recover.json()) as { token?: string };
    expect(body.token).toBeTruthy();

    const same = await request.post("/api/recover/reset", {
      data: { token: body.token, next: requirePassword() },
    });
    expect(same.status()).toBe(400);
    const sameBody = (await same.json()) as { error?: string };
    expect(sameBody.error).toMatch(/al menos 8|distinta/i);

    await loginApi(request);
  });
});
