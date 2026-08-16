import { expect, test } from "@playwright/test";
import { emptyLog } from "../shared/log.ts";
import { emptyPantry } from "../shared/pantry.ts";
import { emptyLoad, emptyLoads, mergeLoads } from "../shared/training.ts";
import { outboxKey } from "../src/offline.ts";
import { seedPlan } from "../shared/seed.ts";

test("la cola offline usa una clave por recurso (last-write-wins)", () => {
  expect(outboxKey({ kind: "plan", plan: seedPlan })).toBe("plan");
  expect(outboxKey({ kind: "loads", loads: emptyLoads() })).toBe("loads");
  expect(outboxKey({ kind: "day", log: emptyLog("2026-08-16") })).toBe("day:2026-08-16");
  expect(outboxKey({ kind: "pantry", state: emptyPantry("2026-08-01") })).toBe("pantry:2026-08-01");
});

test("mergeLoads no borra la semana anterior de un ejercicio", () => {
  const current = {
    ...emptyLoads(),
    byExercise: {
      squat: [
        { note: "", sets: [{ weight: "100", unit: "kg" as const }] },
        { note: "", sets: [{ weight: "105", unit: "kg" as const }] },
      ],
    },
  };
  const incoming = {
    ...emptyLoads(),
    byExercise: {
      squat: [emptyLoad(), { note: "", sets: [{ weight: "110", unit: "kg" as const }] }],
    },
  };
  const merged = mergeLoads(current, incoming);
  expect(merged.byExercise.squat[0]?.sets[0]?.weight).toBe("100");
  expect(merged.byExercise.squat[1]?.sets[0]?.weight).toBe("110");
});
