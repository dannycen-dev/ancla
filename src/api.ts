import { coerceLog, emptyLog, type DayLog } from "../shared/log.ts";
import { coercePantry, emptyPantry, type PantryState } from "../shared/pantry.ts";
import { isPlan, normalizePlan, type Plan } from "../shared/plan.ts";
import { eachDate } from "../shared/schedule.ts";
import { coerceLoads, emptyLoads, type TrainingLoads } from "../shared/training.ts";
import {
  cacheLog,
  cacheLoads,
  cachePantry,
  cachePlan,
  clearOfflineData,
  readCachedLog,
  readCachedLoads,
  readCachedPantry,
  readCachedPlan,
} from "./offline.ts";

export class AuthError extends Error {
  constructor() {
    super("No autorizado");
    this.name = "AuthError";
  }
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function login(password: string): Promise<void> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo iniciar sesión.");
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  } finally {
    await clearOfflineData().catch(() => undefined);
  }
}

export async function changePassword(current: string, next: string): Promise<void> {
  const response = await fetch("/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ current, next }),
  });
  if (response.status === 401) {
    const body = (await parseJson(response)) as { error?: string } | null;
    if (body?.error === "La contraseña actual no coincide.") {
      throw new Error(body.error);
    }
    throw new AuthError();
  }
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo cambiar la contraseña.");
  }
}

export async function checkSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/me", { credentials: "include" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadPlan(): Promise<{ plan: Plan; fromCache: boolean }> {
  try {
    const response = await fetch("/api/plan", { credentials: "include" });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo cargar el plan.");
    const body: unknown = await parseJson(response);
    if (!isPlan(body)) throw new Error("El plan recibido no es válido.");
    const plan = normalizePlan(body);
    await cachePlan(plan);
    return { plan, fromCache: false };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    const cached = await readCachedPlan();
    if (isPlan(cached)) return { plan: normalizePlan(cached), fromCache: true };
    throw error;
  }
}

export async function savePlan(plan: Plan): Promise<Plan> {
  const response = await fetch("/api/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(plan),
  });
  if (response.status === 401) throw new AuthError();
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo guardar.");
  }
  const body: unknown = await parseJson(response);
  if (!isPlan(body)) throw new Error("El plan guardado no es válido.");
  const planSaved = normalizePlan(body);
  await cachePlan(planSaved);
  return planSaved;
}

export type DayPayload = {
  log: DayLog;
  weekZeroCal: number;
  weekFreeMeals: number;
  weekDietBreaks: number;
  accessoryCounts: Record<string, number>;
  loads: TrainingLoads;
};

function fallbackDay(log: DayLog): DayPayload {
  return {
    log,
    weekZeroCal: log.zeroCalDrink ? 1 : 0,
    weekFreeMeals: log.freeMeal ? 1 : 0,
    weekDietBreaks: log.dietBreaks.length,
    accessoryCounts: {},
    loads: emptyLoads(),
  };
}

export async function loadDay(date: string): Promise<DayPayload> {
  try {
    const response = await fetch(`/api/day/${date}`, { credentials: "include" });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo cargar el día.");
    const body = (await parseJson(response)) as {
      log?: unknown;
      weekZeroCal?: number;
      weekFreeMeals?: number;
      weekDietBreaks?: number;
      accessoryCounts?: Record<string, number>;
      loads?: unknown;
    } | null;
    const log = body ? coerceLog(body.log, date) : null;
    if (!log) throw new Error("El día recibido no es válido.");
    await cacheLog(log);
    const loads = coerceLoads(body?.loads);
    await cacheLoads(loads);
    return {
      log,
      weekZeroCal: body?.weekZeroCal ?? 0,
      weekFreeMeals: body?.weekFreeMeals ?? 0,
      weekDietBreaks: body?.weekDietBreaks ?? log.dietBreaks.length,
      accessoryCounts: body?.accessoryCounts ?? {},
      loads,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    const cached = await readCachedLog(date);
    if (cached) {
      return {
        ...fallbackDay(cached),
        loads: await readCachedLoads(),
      };
    }
    return fallbackDay(emptyLog(date));
  }
}

export async function saveDay(log: DayLog): Promise<DayPayload> {
  await cacheLog(log);
  try {
    const response = await fetch(`/api/day/${log.date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(log),
    });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo guardar el día.");
    const body = (await parseJson(response)) as {
      log?: unknown;
      weekZeroCal?: number;
      weekFreeMeals?: number;
      weekDietBreaks?: number;
      accessoryCounts?: Record<string, number>;
      loads?: unknown;
    } | null;
    const saved = body ? coerceLog(body.log, log.date) : null;
    if (!saved) {
      return fallbackDay(log);
    }
    await cacheLog(saved);
    const loads = coerceLoads(body?.loads);
    await cacheLoads(loads);
    return {
      log: saved,
      weekZeroCal: body?.weekZeroCal ?? 0,
      weekFreeMeals: body?.weekFreeMeals ?? 0,
      weekDietBreaks: body?.weekDietBreaks ?? saved.dietBreaks.length,
      accessoryCounts: body?.accessoryCounts ?? {},
      loads,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return fallbackDay(log);
  }
}

export async function saveLoads(loads: TrainingLoads): Promise<TrainingLoads> {
  await cacheLoads(loads);
  try {
    const response = await fetch("/api/loads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(loads),
    });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudieron guardar los pesos.");
    const body: unknown = await parseJson(response);
    const saved = coerceLoads(body);
    await cacheLoads(saved);
    return saved;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return loads;
  }
}

export async function loadRange(from: string, to: string): Promise<DayLog[]> {
  const dates = eachDate(from, to);
  try {
    const response = await fetch(`/api/range?from=${from}&to=${to}`, { credentials: "include" });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo cargar el calendario.");
    const body = (await parseJson(response)) as { logs?: unknown } | null;
    const rawLogs = Array.isArray(body?.logs) ? body.logs : [];
    const logs = dates.map((date, index) => coerceLog(rawLogs[index], date) ?? emptyLog(date));
    await Promise.all(logs.map((log) => cacheLog(log)));
    return logs;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return Promise.all(dates.map(async (date) => (await readCachedLog(date)) ?? emptyLog(date)));
  }
}

export async function loadPantry(periodId: string): Promise<PantryState> {
  try {
    const response = await fetch(`/api/pantry/${periodId}`, { credentials: "include" });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo cargar la despensa.");
    const body: unknown = await parseJson(response);
    const state = coercePantry(body, periodId);
    if (!state) throw new Error("La despensa recibida no es válida.");
    await cachePantry(state);
    return state;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return (await readCachedPantry(periodId)) ?? emptyPantry(periodId);
  }
}

export async function savePantry(state: PantryState): Promise<PantryState> {
  await cachePantry(state);
  try {
    const response = await fetch(`/api/pantry/${state.periodId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(state),
    });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo guardar la despensa.");
    const body: unknown = await parseJson(response);
    const saved = coercePantry(body, state.periodId);
    if (!saved) return state;
    await cachePantry(saved);
    return saved;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return state;
  }
}

export async function askAdvice(date: string, question: string): Promise<string> {
  const response = await fetch("/api/advise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ date, question }),
  });
  if (response.status === 401) throw new AuthError();
  const body = (await parseJson(response)) as { text?: string; error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "No se pudo consultar a la IA.");
  }
  if (!body?.text) throw new Error("La IA no devolvió una respuesta.");
  return body.text;
}
