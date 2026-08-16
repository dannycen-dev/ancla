import { coerceLog, type DayLog } from "../shared/log.ts";
import { coercePantry, type PantryState } from "../shared/pantry.ts";
import type { Plan } from "../shared/plan.ts";
import { coerceLoads, type TrainingLoads } from "../shared/training.ts";

const DB_NAME = "ancla";
const DB_VERSION = 2;
const STORE = "cache";
const OUTBOX = "outbox";
const PLAN_KEY = "plan";
const LOADS_KEY = "loads";

export type OutboxItem =
  | { kind: "plan"; plan: Plan }
  | { kind: "day"; log: DayLog }
  | { kind: "loads"; loads: TrainingLoads }
  | { kind: "pantry"; state: PantryState };

const pendingListeners = new Set<(count: number) => void>();

export function outboxKey(item: OutboxItem): string {
  switch (item.kind) {
    case "plan":
      return "plan";
    case "loads":
      return "loads";
    case "day":
      return `day:${item.log.date}`;
    case "pantry":
      return `pantry:${item.state.periodId}`;
  }
}

function outboxRank(item: OutboxItem): number {
  switch (item.kind) {
    case "plan":
      return 0;
    case "loads":
      return 1;
    case "pantry":
      return 2;
    case "day":
      return 3;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
    });
  }
  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function putValue(key: string, value: unknown): Promise<void> {
  try {
    await withStore(STORE, "readwrite", (store) => store.put(value, key));
  } catch {
    /* Safari en modo privado o cuota llena. */
  }
}

async function getValue<T>(key: string): Promise<T | null> {
  try {
    const value = await withStore<T | undefined>(STORE, "readonly", (store) => store.get(key));
    return value ?? null;
  } catch {
    return null;
  }
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

export async function enqueueOutbox(item: OutboxItem): Promise<void> {
  try {
    await withStore(OUTBOX, "readwrite", (store) => store.put(item, outboxKey(item)));
  } catch {
    return;
  }
  await notifyPending();
}

export async function removeOutbox(key: string): Promise<void> {
  try {
    await withStore(OUTBOX, "readwrite", (store) => store.delete(key));
  } catch {
    return;
  }
  await notifyPending();
}

export async function readOutboxItem(key: string): Promise<OutboxItem | null> {
  try {
    const value = await withStore<OutboxItem | undefined>(OUTBOX, "readonly", (store) => store.get(key));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function listOutbox(): Promise<OutboxItem[]> {
  try {
    const items = await withStore<OutboxItem[]>(OUTBOX, "readonly", (store) => store.getAll());
    return items.slice().sort((a, b) => outboxRank(a) - outboxRank(b) || outboxKey(a).localeCompare(outboxKey(b)));
  } catch {
    return [];
  }
}

export async function pendingCount(): Promise<number> {
  try {
    const keys = await withStore<IDBValidKey[]>(OUTBOX, "readonly", (store) => store.getAllKeys());
    return keys.length;
  } catch {
    return 0;
  }
}

async function notifyPending(): Promise<void> {
  const count = await pendingCount();
  for (const listener of pendingListeners) listener(count);
}

export function subscribePending(listener: (count: number) => void): () => void {
  pendingListeners.add(listener);
  void pendingCount().then(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

export async function clearOfflineData(): Promise<void> {
  pendingListeners.forEach((listener) => listener(0));
  try {
    const db = await dbPromise;
    db?.close();
  } catch {
    /* Safari puede tener la conexión ya cerrada. */
  }
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      window.setTimeout(() => resolve(), 400);
    };
  });
}
