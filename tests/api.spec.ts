import { expect, test } from "@playwright/test";
import { emptyLog } from "../shared/log.ts";
import { loginApi, requirePassword } from "./helpers.ts";

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
    const response = await request.put("/api/day/2026-08-16", {
      data: emptyLog("2026-08-16"),
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
    const huge = await request.put("/api/day/2026-08-16", {
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
    const huge = await request.put("/api/pantry/2026-08-16_2026-08-31", {
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
    const response = await request.put("/api/day/2026-08-16", {
      data: { nope: true },
    });
    expect(response.status()).toBe(400);
  });

  test("guardar día válido", async ({ request }) => {
    await loginApi(request);
    const log = { ...emptyLog("2026-08-16"), waterHalves: 2 };
    const response = await request.put("/api/day/2026-08-16", { data: log });
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
            date: "2026-08-16",
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
            date: "2026-08-16",
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
});
