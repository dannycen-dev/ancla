import { Hono, type Context } from "hono";
import { coerceLog, emptyLog, isDateKey, type DayLog } from "../shared/log.ts";
import { coercePantry, emptyPantry, type PantryState } from "../shared/pantry.ts";
import { parsePeriodId, payPeriodFor } from "../shared/period.ts";
import { isPlan, normalizePlan, type Plan } from "../shared/plan.ts";
import { eachDate, weekDates } from "../shared/schedule.ts";
import { seedPlan } from "../shared/seed.ts";
import { coerceLoads, mergeLoads, type TrainingLoads } from "../shared/training.ts";
import { runAdvice } from "./advise.ts";
import {
  clearSessionCookie,
  createSessionCookie,
  hashPassword,
  parseSession,
  passwordsMatch,
  shouldRefreshSession,
  verifyHashedPassword,
} from "./auth.ts";
import {
  MAX_JSON_BYTES,
  clearLoginFailures,
  clientIp,
  loginAllowed,
  noStoreApi,
  readJson,
  adviseAllowed,
  writeAllowed,
  requireSameOrigin,
  securityHeaders,
} from "./security.ts";

const PLAN_KEY = "current";
const LOADS_KEY = "loads";
const PASSWORD_KEY = "auth:password";
const GEN_KEY = "auth:gen";
const MAX_PASSWORD = 128;
const MIN_PASSWORD = 8;

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);
app.use("/api/*", noStoreApi);
app.use("/api/*", requireSameOrigin);

async function readPlan(env: Env): Promise<Plan> {
  const stored = await env.PLAN_KV.get(PLAN_KEY, "json");
  if (!isPlan(stored)) {
    await env.PLAN_KV.put(PLAN_KEY, JSON.stringify(seedPlan));
    return seedPlan;
  }
  return normalizePlan(stored);
}

async function readLoads(env: Env, weekCount: number): Promise<TrainingLoads> {
  const stored = await env.PLAN_KV.get(LOADS_KEY, "json");
  return coerceLoads(stored, weekCount);
}

async function passwordAccepted(env: Env, given: string): Promise<boolean> {
  const stored = await env.PLAN_KV.get(PASSWORD_KEY);
  if (stored) return verifyHashedPassword(given, stored);
  const fallback = env.APP_PASSWORD;
  return Boolean(fallback) && (await passwordsMatch(given, fallback));
}

async function sessionGeneration(env: Env): Promise<number> {
  const raw = Number((await env.PLAN_KV.get(GEN_KEY)) ?? "0");
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

async function requireAuth(c: Context<{ Bindings: Env }>) {
  const secret = c.env.SESSION_SECRET;
  const session = secret ? await parseSession(c.req.raw, secret) : null;
  const generation = await sessionGeneration(c.env);
  if (!session || session.generation !== generation) {
    c.header("Set-Cookie", clearSessionCookie(c.req.url));
    return c.json({ error: "No autorizado." }, 401);
  }
  const mutating = c.req.method !== "GET" && c.req.method !== "HEAD";
  if (mutating && !(await writeAllowed(c.env.PLAN_KV, clientIp(c.req.raw)))) {
    return c.json({ error: "Demasiadas escrituras. Espera un minuto." }, 429);
  }
  if (secret && shouldRefreshSession(session.exp)) {
    c.header("Set-Cookie", await createSessionCookie(secret, c.req.url, generation));
  }
  return null;
}

app.post("/api/login", async (c) => {
  const password = c.env.APP_PASSWORD;
  const secret = c.env.SESSION_SECRET;
  if (!password || !secret) {
    console.error(JSON.stringify({ message: "login missing secrets" }));
    return c.json({ error: "Servicio no disponible." }, 500);
  }

  const ip = clientIp(c.req.raw);
  if (!(await loginAllowed(c.env.PLAN_KV, ip))) {
    return c.json({ error: "Demasiados intentos. Espera unos minutos." }, 429);
  }

  const body = (await readJson(c.req.raw, MAX_JSON_BYTES.login)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password.slice(0, MAX_PASSWORD) : "";
  if (!(await passwordAccepted(c.env, given))) {
    return c.json({ error: "Contraseña incorrecta." }, 401);
  }

  await clearLoginFailures(c.env.PLAN_KV, ip);
  c.header("Set-Cookie", await createSessionCookie(secret, c.req.url, await sessionGeneration(c.env)));
  return c.json({ ok: true });
});

app.post("/api/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie(c.req.url));
  return c.json({ ok: true });
});

app.post("/api/password", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;

  const body = (await readJson(c.req.raw, MAX_JSON_BYTES.login)) as {
    next?: unknown;
  } | null;
  const next = typeof body?.next === "string" ? body.next.slice(0, MAX_PASSWORD) : "";
  if (next.length < MIN_PASSWORD) {
    return c.json({ error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` }, 400);
  }
  if (await passwordAccepted(c.env, next)) {
    return c.json({ error: "La nueva contraseña debe ser distinta." }, 400);
  }
  const secret = c.env.SESSION_SECRET;
  if (!secret) return c.json({ error: "Servicio no disponible." }, 500);
  await c.env.PLAN_KV.put(PASSWORD_KEY, await hashPassword(next));
  const generation = (await sessionGeneration(c.env)) + 1;
  await c.env.PLAN_KV.put(GEN_KEY, String(generation));
  c.header("Set-Cookie", await createSessionCookie(secret, c.req.url, generation));
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return c.json({ ok: true });
});

app.get("/api/plan", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  return c.json(await readPlan(c.env));
});

app.put("/api/plan", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;

  const body = await readJson(c.req.raw, MAX_JSON_BYTES.plan);
  if (body == null || !isPlan(body)) {
    return c.json({ error: "El plan no tiene un formato válido." }, 400);
  }

  const next: Plan = {
    ...normalizePlan(body),
    updatedAt: new Date().toISOString(),
  };
  await c.env.PLAN_KV.put(PLAN_KEY, JSON.stringify(next));
  return c.json(next);
});

async function weekLogs(env: Env, date: string): Promise<DayLog[]> {
  const dates = weekDates(date);
  const stored = await Promise.all(dates.map((day) => env.PLAN_KV.get(`log:${day}`, "json")));
  return dates.map((day, index) => coerceLog(stored[index], day) ?? emptyLog(day));
}

async function dayPayload(env: Env, date: string, log: DayLog, plan: Plan) {
  const [logs, loads] = await Promise.all([weekLogs(env, date), readLoads(env, plan.training.weekCount)]);
  const accessoryCounts: Record<string, number> = {};
  for (const session of plan.training.sessions.filter((item) => item.block === "accesorio")) {
    accessoryCounts[session.id] = logs.filter((item) => item.doneSessionIds.includes(session.id)).length;
  }
  return {
    log,
    weekZeroCal: logs.filter((item) => item.zeroCalDrink).length,
    weekFreeMeals: logs.filter((item) => item.freeMeal).length,
    weekDietBreaks: logs.reduce((sum, item) => sum + item.dietBreaks.length, 0),
    accessoryCounts,
    loads,
  };
}

app.get("/api/day/:date", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const date = c.req.param("date");
  if (!isDateKey(date)) return c.json({ error: "Fecha inválida." }, 400);
  const plan = await readPlan(c.env);
  const stored = await c.env.PLAN_KV.get(`log:${date}`, "json");
  const log = coerceLog(stored, date) ?? emptyLog(date);
  return c.json(await dayPayload(c.env, date, log, plan));
});

app.put("/api/day/:date", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const date = c.req.param("date");
  if (!isDateKey(date)) return c.json({ error: "Fecha inválida." }, 400);
  const body = await readJson(c.req.raw, MAX_JSON_BYTES.day);
  if (body == null) {
    return c.json({ error: "El registro no es válido." }, 400);
  }
  const parsed = coerceLog(body, date);
  if (!parsed) {
    return c.json({ error: "El registro no es válido." }, 400);
  }
  const log: DayLog = {
    ...parsed,
    date,
    waterHalves: Math.max(0, Math.min(20, Math.round(parsed.waterHalves))),
    extraWaterHalves: Math.max(0, Math.min(20, Math.round(parsed.extraWaterHalves))),
  };
  await c.env.PLAN_KV.put(`log:${date}`, JSON.stringify(log));
  const plan = await readPlan(c.env);
  return c.json(await dayPayload(c.env, date, log, plan));
});

app.get("/api/range", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!isDateKey(from) || !isDateKey(to)) return c.json({ error: "Rango inválido." }, 400);
  const dates = eachDate(from, to);
  if (dates.length === 0 || dates.length > 120) {
    return c.json({ error: "Rango inválido." }, 400);
  }
  const stored = await Promise.all(dates.map((day) => c.env.PLAN_KV.get(`log:${day}`, "json")));
  const logs = dates.map((day, index) => coerceLog(stored[index], day) ?? emptyLog(day));
  return c.json({ logs });
});

app.get("/api/pantry/:id", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const period = parsePeriodId(c.req.param("id"));
  if (!period) return c.json({ error: "Quincena inválida." }, 400);
  const stored = await c.env.PLAN_KV.get(`pantry:${period.id}`, "json");
  return c.json(coercePantry(stored, period.id) ?? emptyPantry(period.id));
});

app.put("/api/pantry/:id", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const period = parsePeriodId(c.req.param("id"));
  if (!period) return c.json({ error: "Quincena inválida." }, 400);
  const body = await readJson(c.req.raw, MAX_JSON_BYTES.pantry);
  if (body == null) {
    return c.json({ error: "La despensa no es válida." }, 400);
  }
  const parsed = coercePantry(body, period.id);
  if (!parsed) {
    return c.json({ error: "La despensa no es válida." }, 400);
  }
  const state: PantryState = { periodId: period.id, checkedIds: parsed.checkedIds };
  await c.env.PLAN_KV.put(`pantry:${period.id}`, JSON.stringify(state));
  return c.json(state);
});

app.get("/api/loads", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const plan = await readPlan(c.env);
  return c.json(await readLoads(c.env, plan.training.weekCount));
});

app.put("/api/loads", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const plan = await readPlan(c.env);
  const body = await readJson(c.req.raw, MAX_JSON_BYTES.loads);
  if (body == null || typeof body !== "object") {
    return c.json({ error: "Los pesos no son válidos." }, 400);
  }
  const incoming = coerceLoads(body, plan.training.weekCount);
  const current = await readLoads(c.env, plan.training.weekCount);
  const loads = mergeLoads(current, incoming);
  await c.env.PLAN_KV.put(LOADS_KEY, JSON.stringify(loads));
  return c.json(loads);
});

app.post("/api/advise", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const body = (await readJson(c.req.raw, MAX_JSON_BYTES.advise)) as {
    date?: unknown;
    question?: unknown;
  } | null;
  if (body == null) return c.json({ error: "La consulta no es válida." }, 400);
  const date = typeof body.date === "string" ? body.date : "";
  const question = (typeof body.question === "string" ? body.question : "").trim().slice(0, 500);
  if (!isDateKey(date)) return c.json({ error: "Fecha inválida." }, 400);
  if (question.length < 4) return c.json({ error: "Escribe una pregunta un poco más clara." }, 400);
  if (!(await adviseAllowed(c.env.PLAN_KV, clientIp(c.req.raw)))) {
    return c.json({ error: "Demasiadas consultas a la IA. Espera unos minutos." }, 429);
  }
  if (!c.env.AI) {
    return c.json({ error: "Workers AI no está configurado." }, 503);
  }

  const dates = weekDates(date);
  const period = payPeriodFor(date);
  const [plan, storedLogs, pantryStored] = await Promise.all([
    readPlan(c.env),
    Promise.all(dates.map((day) => c.env.PLAN_KV.get(`log:${day}`, "json"))),
    c.env.PLAN_KV.get(`pantry:${period.id}`, "json"),
  ]);
  const logs = dates.map((day, index) => coerceLog(storedLogs[index], day) ?? emptyLog(day));
  const pantry = coercePantry(pantryStored, period.id);

  try {
    const text = await runAdvice(c.env.AI, { plan, date, question, logs, pantry, period });
    return c.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "advise failed", error: message }));
    if (message === "timeout") {
      return c.json({ error: "La IA tardó demasiado. Intenta de nuevo." }, 504);
    }
    return c.json({ error: "No se pudo consultar a la IA." }, 502);
  }
});

app.all("/api/*", (c) => c.json({ error: "No encontrado." }, 404));

export default app;
