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
  enqueueOutbox,
  listOutbox,
  outboxKey,
  pendingCount,
  readCachedLog,
  readCachedLoads,
  readCachedPantry,
  readCachedPlan,
  readOutboxItem,
  removeOutboxIfUnchanged,
  type OutboxItem,
} from "./offline.ts";

export class AuthError extends Error {
  constructor() {
    super("No autorizado");
    this.name = "AuthError";
  }
}

export type SessionStatus = "ok" | "unauth" | "offline";

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}

const draftFlushers = new Set<() => void | Promise<void>>();

export function registerDraftFlush(flush: () => void | Promise<void>): () => void {
  draftFlushers.add(flush);
  return () => {
    draftFlushers.delete(flush);
  };
}

export async function flushDraftsNow(): Promise<void> {
  window.dispatchEvent(new Event("ancla-flush-drafts"));
  await Promise.all([...draftFlushers].map((flush) => Promise.resolve(flush()).catch(() => undefined)));
}

export async function persistStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* Safari puede negar persistencia. */
  }
}

export async function login(password: string): Promise<void> {
  const response = await apiFetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo iniciar sesión.");
  }
  await persistStorage();
  clearLoggedOut();
}

const LOGOUT_FLAG = "ancla-logged-out";
const RM_STORAGE_KEY = "ancla-rm";

export function markLoggedOut(): void {
  try {
    localStorage.setItem(LOGOUT_FLAG, "1");
  } catch {
    /* Safari privado. */
  }
  try {
    localStorage.removeItem(RM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearLoggedOut(): void {
  try {
    localStorage.removeItem(LOGOUT_FLAG);
  } catch {
    /* ignore */
  }
}

export function isLoggedOutLocally(): boolean {
  try {
    return localStorage.getItem(LOGOUT_FLAG) === "1";
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  markLoggedOut();
  await flushDraftsNow();
  await Promise.race([
    flushPending().catch(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 2500);
    }),
  ]);
  let serverOk = false;
  try {
    const response = await apiFetch("/api/logout", { method: "POST", signal: AbortSignal.timeout(4000) });
    serverOk = response.ok;
  } catch {
    /* Sin red la cookie sigue; la bandera local impide reentrar al volver la señal. */
  }
  if (!serverOk) return;
  const remaining = await pendingCount();
  if (remaining > 0) return;
  await clearOfflineData().catch(() => undefined);
}

export async function requestRecovery(): Promise<void> {
  const response = await apiFetch("/api/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo enviar el correo.");
  }
}

export async function resetPasswordWithToken(token: string, next: string): Promise<void> {
  const response = await apiFetch("/api/recover/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, next }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo cambiar la contraseña.");
  }
  await persistStorage();
  clearLoggedOut();
}

export async function changePassword(next: string): Promise<void> {
  const response = await apiFetch("/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ next }),
  });
  if (response.status === 401) throw new AuthError();
  if (!response.ok) {
    const body = (await parseJson(response)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo cambiar la contraseña.");
  }
}

export async function probeSession(): Promise<SessionStatus> {
  try {
    const response = await apiFetch("/api/me", { signal: AbortSignal.timeout(3000) });
    if (response.ok) return "ok";
    if (response.status === 401) return "unauth";
    return "offline";
  } catch {
    return "offline";
  }
}

export type DayPayload = {
  log: DayLog;
  weekZeroCal: number;
  weekFreeMeals: number;
  weekDietBreaks: number;
  accessoryCounts: Record<string, number>;
  loads: TrainingLoads;
};

function fallbackDay(log: DayLog, loads: TrainingLoads = emptyLoads()): DayPayload {
  return {
    log,
    weekZeroCal: log.zeroCalDrink ? 1 : 0,
    weekFreeMeals: log.freeMeal ? 1 : 0,
    weekDietBreaks: log.dietBreaks.length,
    accessoryCounts: {},
    loads,
  };
}

type DayBody = {
  log?: unknown;
  weekZeroCal?: number;
  weekFreeMeals?: number;
  weekDietBreaks?: number;
  accessoryCounts?: Record<string, number>;
  loads?: unknown;
};

function payloadFromBody(date: string, body: DayBody | null): DayPayload | null {
  const log = body ? coerceLog(body.log, date) : null;
  if (!log || !body) return null;
  const loads = coerceLoads(body.loads);
  return {
    log,
    weekZeroCal: body.weekZeroCal ?? 0,
    weekFreeMeals: body.weekFreeMeals ?? 0,
    weekDietBreaks: body.weekDietBreaks ?? log.dietBreaks.length,
    accessoryCounts: body.accessoryCounts ?? {},
    loads,
  };
}

type UploadResult =
  | { status: "ok"; day?: DayPayload; plan?: Plan; loads?: TrainingLoads; pantry?: PantryState }
  | { status: "auth" }
  | { status: "fail" };

async function putJson(url: string, body: unknown): Promise<Response> {
  return apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

let flushChain: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = flushChain.then(work, work);
  flushChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function uploadItem(item: OutboxItem): Promise<UploadResult> {
  let response: Response;
  try {
    switch (item.kind) {
      case "plan":
        response = await putJson("/api/plan", item.plan);
        break;
      case "loads":
        response = await putJson("/api/loads", item.loads);
        break;
      case "pantry":
        response = await putJson(`/api/pantry/${item.state.periodId}`, item.state);
        break;
      case "day":
        response = await putJson(`/api/day/${item.log.date}`, item.log);
        break;
    }
  } catch (error) {
    if (isNetworkError(error)) return { status: "fail" };
    throw error;
  }
  if (response.status === 401) return { status: "auth" };
  if (!response.ok) return { status: "fail" };

  const body: unknown = await parseJson(response);
  if (item.kind === "plan" && isPlan(body)) {
    const plan = normalizePlan(body);
    await cachePlan(plan);
    return { status: "ok", plan };
  }
  if (item.kind === "loads") {
    const loads = coerceLoads(body);
    await cacheLoads(loads);
    return { status: "ok", loads };
  }
  if (item.kind === "pantry") {
    const pantry = coercePantry(body, item.state.periodId) ?? item.state;
    await cachePantry(pantry);
    return { status: "ok", pantry };
  }
  if (item.kind !== "day") return { status: "ok" };
  const day = payloadFromBody(item.log.date, body as DayBody | null) ?? fallbackDay(item.log, await readCachedLoads());
  await cacheLog(day.log);
  const queuedLoads = await readOutboxItem("loads");
  if (queuedLoads?.kind === "loads") {
    return { status: "ok", day: { ...day, loads: queuedLoads.loads } };
  }
  await cacheLoads(day.loads);
  return { status: "ok", day };
}

async function uploadLatest(key: string): Promise<UploadResult> {
  const item = await readOutboxItem(key);
  if (!item) return { status: "ok" };
  const snapshot = JSON.stringify(item);
  const result = await uploadItem(item);
  if (result.status !== "ok") return result;
  const removed = await removeOutboxIfUnchanged(key, snapshot);
  if (!removed) {
    const current = await readOutboxItem(key);
    if (current) return uploadLatest(key);
  }
  return result;
}

export async function flushPending(): Promise<{ remaining: number; authLost: boolean }> {
  return serialize(async () => {
    const items = await listOutbox();
    for (const item of items) {
      const result = await uploadLatest(outboxKey(item));
      if (result.status === "ok") continue;
      if (result.status === "auth") return { remaining: await pendingCount(), authLost: true };
      return { remaining: await pendingCount(), authLost: false };
    }
    return { remaining: 0, authLost: false };
  });
}

async function rememberAndUpload(item: OutboxItem): Promise<UploadResult> {
  const queued = await enqueueOutbox(item);
  if (!queued) return serialize(() => uploadItem(item));
  return serialize(() => uploadLatest(outboxKey(item)));
}

export async function loadPlan(): Promise<{ plan: Plan; fromCache: boolean }> {
  const queued = await readOutboxItem("plan");
  if (queued?.kind === "plan" && isPlan(queued.plan)) {
    const plan = normalizePlan(queued.plan);
    await cachePlan(plan);
    void flushPending();
    return { plan, fromCache: true };
  }
  try {
    const response = await apiFetch("/api/plan");
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
  const next = normalizePlan(plan);
  await cachePlan(next);
  const result = await rememberAndUpload({ kind: "plan", plan: next });
  if (result.status === "auth") throw new AuthError();
  if (result.status === "ok" && result.plan) return result.plan;
  return next;
}

async function preferQueuedDay(date: string, payload: DayPayload): Promise<DayPayload> {
  const [queuedDay, queuedLoads] = await Promise.all([readOutboxItem(`day:${date}`), readOutboxItem("loads")]);
  return {
    ...payload,
    log: queuedDay?.kind === "day" ? queuedDay.log : payload.log,
    loads: queuedLoads?.kind === "loads" ? queuedLoads.loads : payload.loads,
  };
}

export async function loadDay(date: string): Promise<DayPayload> {
  const queued = await readOutboxItem(`day:${date}`);
  if (queued?.kind === "day") {
    void flushPending();
    const loadsItem = await readOutboxItem("loads");
    const loads = loadsItem?.kind === "loads" ? loadsItem.loads : await readCachedLoads();
    return fallbackDay(queued.log, loads ?? emptyLoads());
  }
  try {
    const response = await apiFetch(`/api/day/${date}`);
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo cargar el día.");
    const body = (await parseJson(response)) as Parameters<typeof payloadFromBody>[1];
    const payload = payloadFromBody(date, body);
    if (!payload) throw new Error("El día recibido no es válido.");
    const next = await preferQueuedDay(date, payload);
    await cacheLog(next.log);
    await cacheLoads(next.loads);
    return next;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    const cached = await readCachedLog(date);
    const queuedLoads = await readOutboxItem("loads");
    const loads = queuedLoads?.kind === "loads" ? queuedLoads.loads : await readCachedLoads();
    if (cached) return fallbackDay(cached, loads ?? emptyLoads());
    return fallbackDay(emptyLog(date), loads ?? emptyLoads());
  }
}

export async function saveDay(log: DayLog): Promise<DayPayload> {
  await cacheLog(log);
  const result = await rememberAndUpload({ kind: "day", log });
  if (result.status === "auth") throw new AuthError();
  if (result.status === "ok" && result.day) return result.day;
  return fallbackDay(log, await readCachedLoads());
}

export async function saveLoads(loads: TrainingLoads): Promise<TrainingLoads> {
  await cacheLoads(loads);
  const result = await rememberAndUpload({ kind: "loads", loads });
  if (result.status === "auth") throw new AuthError();
  if (result.status === "ok" && result.loads) return result.loads;
  return loads;
}

export async function loadRange(from: string, to: string): Promise<DayLog[]> {
  const dates = eachDate(from, to);
  try {
    const response = await apiFetch(`/api/range?from=${from}&to=${to}`);
    if (response.status === 401) throw new AuthError();
    if (!response.ok) throw new Error("No se pudo cargar el calendario.");
    const body = (await parseJson(response)) as { logs?: unknown } | null;
    const rawLogs = Array.isArray(body?.logs) ? body.logs : [];
    const logs = await Promise.all(
      dates.map(async (date, index) => {
        const queued = await readOutboxItem(`day:${date}`);
        if (queued?.kind === "day") return queued.log;
        return coerceLog(rawLogs[index], date) ?? emptyLog(date);
      }),
    );
    await Promise.all(logs.map((log) => cacheLog(log)));
    return logs;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return Promise.all(
      dates.map(async (date) => {
        const queued = await readOutboxItem(`day:${date}`);
        if (queued?.kind === "day") return queued.log;
        return (await readCachedLog(date)) ?? emptyLog(date);
      }),
    );
  }
}

export async function loadPantry(periodId: string): Promise<PantryState> {
  const queued = await readOutboxItem(`pantry:${periodId}`);
  if (queued?.kind === "pantry") {
    void flushPending();
    return queued.state;
  }
  try {
    const response = await apiFetch(`/api/pantry/${periodId}`);
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
  const result = await rememberAndUpload({ kind: "pantry", state });
  if (result.status === "auth") throw new AuthError();
  if (result.status === "ok" && result.pantry) return result.pantry;
  return state;
}

export async function askAdvice(date: string, question: string): Promise<string> {
  let response: Response;
  try {
    response = await apiFetch("/api/advise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, question }),
    });
  } catch {
    throw new Error("Sin conexión. La IA necesita red.");
  }
  if (response.status === 401) throw new AuthError();
  const body = (await parseJson(response)) as { text?: string; error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "No se pudo consultar a la IA.");
  }
  if (!body?.text) throw new Error("La IA no devolvió una respuesta.");
  return body.text;
}
