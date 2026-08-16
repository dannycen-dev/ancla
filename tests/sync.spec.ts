import { expect, test } from "@playwright/test";
import { emptyLog } from "../shared/log.ts";
import { emptyPantry } from "../shared/pantry.ts";
import { emptyLoads } from "../shared/training.ts";
import { outboxKey } from "../src/offline.ts";
import { seedPlan } from "../shared/seed.ts";

test("la cola offline usa una clave por recurso (last-write-wins)", () => {
  expect(outboxKey({ kind: "plan", plan: seedPlan })).toBe("plan");
  expect(outboxKey({ kind: "loads", loads: emptyLoads() })).toBe("loads");
  expect(outboxKey({ kind: "day", log: emptyLog("2026-08-16") })).toBe("day:2026-08-16");
  expect(outboxKey({ kind: "pantry", state: emptyPantry("2026-08-01") })).toBe("pantry:2026-08-01");
});
