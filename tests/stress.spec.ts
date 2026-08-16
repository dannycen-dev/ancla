import { expect, test } from "@playwright/test";
import { emptyLog } from "../shared/log.ts";
import { payPeriodFor } from "../shared/period.ts";
import { coerceLoads } from "../shared/training.ts";
import { loginApi } from "./helpers.ts";

test.describe("estrés", () => {
  test("20 PUT concurrentes de día dejan JSON válido", async ({ request }) => {
    await loginApi(request);
    const date = "2026-09-01";
    const writes = Array.from({ length: 20 }, (_, index) =>
      request.put(`/api/day/${date}`, {
        data: { ...emptyLog(date), waterHalves: (index % 7) + 1 },
      }),
    );
    const results = await Promise.all(writes);
    expect(results.every((item) => item.ok())).toBeTruthy();
    const latest = await request.get(`/api/day/${date}`);
    expect(latest.ok()).toBeTruthy();
    const body = (await latest.json()) as { log: { waterHalves: number } };
    expect(body.log.waterHalves).toBeGreaterThanOrEqual(1);
    expect(body.log.waterHalves).toBeLessThanOrEqual(7);
  });

  test("PUT loads concurrentes no rompen el shape", async ({ request }) => {
    await loginApi(request);
    const payload = {
      byExercise: {
        "d1-press-plano": [{ note: "stress", sets: [{ weight: "60", unit: "kg" }] }],
      },
      history: [
        {
          date: "2026-09-01",
          exerciseId: "d1-press-plano",
          week: 1,
          note: "stress",
          sets: [{ weight: "60", unit: "kg" }],
        },
      ],
      rms: [],
    };
    const writes = Array.from({ length: 20 }, () => request.put("/api/loads", { data: payload }));
    const results = await Promise.all(writes);
    expect(results.every((item) => item.ok())).toBeTruthy();
    const latest = await request.get("/api/loads");
    const body: unknown = await latest.json();
    const coerced = coerceLoads(body);
    expect(coerced.byExercise["d1-press-plano"][0]?.sets[0]?.weight).toBe("60");
    expect(Array.isArray(coerced.history)).toBeTruthy();
    expect(Array.isArray(coerced.rms)).toBeTruthy();
  });

  test("20 PUT concurrentes de despensa dejan JSON válido", async ({ request }) => {
    await loginApi(request);
    const period = payPeriodFor("2026-09-01");
    const writes = Array.from({ length: 20 }, (_, index) =>
      request.put(`/api/pantry/${period.id}`, {
        data: { periodId: period.id, checkedIds: [`item-${index % 5}`] },
      }),
    );
    const results = await Promise.all(writes);
    expect(results.every((item) => item.ok())).toBeTruthy();
    const latest = await request.get(`/api/pantry/${period.id}`);
    const body = (await latest.json()) as { checkedIds: string[] };
    expect(body.checkedIds.length).toBeGreaterThan(0);
    expect(body.checkedIds.length).toBeLessThanOrEqual(5);
  });

  test("escrituras mezcladas día+pesos+despensa quedan coherentes", async ({ request }) => {
    await loginApi(request);
    const date = "2026-09-02";
    const period = payPeriodFor(date);
    const log = { ...emptyLog(date), waterHalves: 4, cardioDone: true };
    const loads = {
      byExercise: {
        mix: [{ note: "", sets: [{ weight: "40", unit: "kg" }] }],
      },
      history: [
        {
          date,
          exerciseId: "mix",
          week: 1,
          note: "",
          sets: [{ weight: "40", unit: "kg" }],
        },
      ],
      rms: [],
    };
    const pantry = { periodId: period.id, checkedIds: ["arroz"] };
    const results = await Promise.all([
      request.put(`/api/day/${date}`, { data: log }),
      request.put("/api/loads", { data: loads }),
      request.put(`/api/pantry/${period.id}`, { data: pantry }),
    ]);
    expect(results.every((item) => item.ok())).toBeTruthy();

    const day = (await (await request.get(`/api/day/${date}`)).json()) as { log: { waterHalves: number } };
    const storedLoads = coerceLoads(await (await request.get("/api/loads")).json());
    const storedPantry = (await (await request.get(`/api/pantry/${period.id}`)).json()) as { checkedIds: string[] };
    expect(day.log.waterHalves).toBe(4);
    expect(storedLoads.byExercise.mix[0]?.sets[0]?.weight).toBe("40");
    expect(storedPantry.checkedIds).toContain("arroz");
  });
});
