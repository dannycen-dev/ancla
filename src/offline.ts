import { coerceLog, type DayLog } from "../shared/log.ts";
import { coercePantry, type PantryState } from "../shared/pantry.ts";
import type { Plan } from "../shared/plan.ts";
import { coerceLoads, type TrainingLoads } from "../shared/training.ts";

const DB_NAME = "ancla";
const STORE = "cache";
const PLAN_KEY = "plan";
const LOADS_KEY = "loads";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putValue(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function getValue<T>(key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function cachePlan(plan: Plan): Promise<void> {
  await putValue(PLAN_KEY, plan);
}

export async function readCachedPlan(): Promise<Plan | null> {
  return getValue<Plan>(PLAN_KEY);
}

export async function cacheLog(log: DayLog): Promise<void> {
  await putValue(`log:${log.date}`, log);
}

export async function readCachedLog(date: string): Promise<DayLog | null> {
  const value = await getValue<unknown>(`log:${date}`);
  return coerceLog(value, date);
}

export async function cachePantry(state: PantryState): Promise<void> {
  await putValue(`pantry:${state.periodId}`, state);
}

export async function readCachedPantry(periodId: string): Promise<PantryState | null> {
  const value = await getValue<unknown>(`pantry:${periodId}`);
  return coercePantry(value, periodId);
}

export async function cacheLoads(loads: TrainingLoads): Promise<void> {
  await putValue(LOADS_KEY, loads);
}

export async function readCachedLoads(): Promise<TrainingLoads> {
  return coerceLoads(await getValue<unknown>(LOADS_KEY));
}

export async function clearOfflineData(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
