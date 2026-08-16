import { Hono, type Context } from "hono";
import { coerceLog, emptyLog, isDateKey, type DayLog } from "../shared/log.ts";
import { coercePantry, emptyPantry, type PantryState } from "../shared/pantry.ts";
import { parsePeriodId, payPeriodFor } from "../shared/period.ts";
import { isPlan, normalizePlan, type Plan } from "../shared/plan.ts";
import { eachDate, weekDates } from "../shared/schedule.ts";
import { seedPlan } from "../shared/seed.ts";
import { coerceLoads, type TrainingLoads } from "../shared/training.ts";
import { runAdvice } from "./advise.ts";
import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  passwordsMatch,
} from "./auth.ts";
import {
  MAX_JSON_BYTES,
  clearLoginFailures,
  clientIp,
  loginAllowed,
  noStoreApi,
  readJson,
  rememberLoginFailure,
  requireSameOrigin,
  securityHeaders,
} from "./security.ts";

const PLAN_KEY = "current";
const LOADS_KEY = "loads";
const MAX_PASSWORD = 128;

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
  const plan = normalizePlan(stored);
  if (JSON.stringify(stored) !== JSON.stringify(plan)) {
    await env.PLAN_KV.put(PLAN_KEY, JSON.stringify(plan));
  }
  return plan;
}

async function readLoads(env: Env, weekCount: number): Promise<TrainingLoads> {
  const stored = await env.PLAN_KV.get(LOADS_KEY, "json");
  return coerceLoads(stored, weekCount);
}

async function requireAuth(c: Context<{ Bindings: Env }>) {
  const secret = c.env.SESSION_SECRET;
  if (!secret || !(await hasValidSession(c.req.raw, secret))) {
    return c.json({ error: "No autorizado." }, 401);
  }
  return null;
}

app.post("/api/login", async (c) => {
  const password = c.env.APP_PASSWORD;
  const secret = c.env.SESSION_SECRET;
  if (!password || !secret) {
    return c.json({ error: "Faltan APP_PASSWORD o SESSION_SECRET." }, 500);
  }

  const ip = clientIp(c.req.raw);
  if (!(await loginAllowed(c.env.PLAN_KV, ip))) {
    return c.json({ error: "Demasiados intentos. Espera unos minutos." }, 429);
  }

  const body = (await readJson(c.req.raw, MAX_JSON_BYTES.login)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password.slice(0, MAX_PASSWORD) : "";
  if (!passwordsMatch(given, password)) {
    await rememberLoginFailure(c.env.PLAN_KV, ip);
    return c.json({ error: "Contraseña incorrecta." }, 401);
  }

  await clearLoginFailures(c.env.PLAN_KV, ip);
  c.header("Set-Cookie", await createSessionCookie(secret, c.req.url));
  return c.json({ ok: true });
});

app.post("/api/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie(c.req.url));
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  const secret = c.env.SESSION_SECRET;
  if (!secret || !(await hasValidSession(c.req.raw, secret))) {
    return c.json({ ok: false }, 401);
  }
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
  if (!isPlan(body)) {
    return c.json({ error: "El plan no tiene un formato válido." }, 400);
  }

  const next: Plan = {
    ...normalizePlan(body),
    updatedAt: new Date().toISOString(),
  };
  await c.env.PLAN_KV.put(PLAN_KEY, JSON.stringify(next));
  return c.json(next);
});

async function weekFlagCount(env: Env, date: string, flag: "zeroCalDrink" | "freeMeal"): Promise<number> {
  const dates = weekDates(date);
  const logs = await Promise.all(dates.map((day) => env.PLAN_KV.get(`log:${day}`, "json")));
  return dates.reduce((count, day, index) => {
    const log = coerceLog(logs[index], day);
    return log && log[flag] ? count + 1 : count;
  }, 0);
}

async function weekBreakCount(env: Env, date: string): Promise<number> {
  const dates = weekDates(date);
  const logs = await Promise.all(dates.map((day) => env.PLAN_KV.get(`log:${day}`, "json")));
  return dates.reduce((count, day, index) => {
    const log = coerceLog(logs[index], day);
    return count + (log?.dietBreaks.length ?? 0);
  }, 0);
}

async function weekSessionCount(env: Env, date: string, sessionId: string): Promise<number> {
  const dates = weekDates(date);
  const logs = await Promise.all(dates.map((day) => env.PLAN_KV.get(`log:${day}`, "json")));
  return dates.reduce((count, day, index) => {
    const log = coerceLog(logs[index], day);
    return log?.doneSessionIds.includes(sessionId) ? count + 1 : count;
  }, 0);
}

async function dayPayload(env: Env, date: string, log: DayLog, weekCount: number) {
  const plan = await readPlan(env);
  const accessoryCounts: Record<string, number> = {};
  for (const session of plan.training.sessions.filter((item) => item.block === "accesorio")) {
    accessoryCounts[session.id] = await weekSessionCount(env, date, session.id);
  }
  return {
    log,
    weekZeroCal: await weekFlagCount(env, date, "zeroCalDrink"),
    weekFreeMeals: await weekFlagCount(env, date, "freeMeal"),
    weekDietBreaks: await weekBreakCount(env, date),
    accessoryCounts,
    loads: await readLoads(env, weekCount),
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
  return c.json(await dayPayload(c.env, date, log, plan.training.weekCount));
});

app.put("/api/day/:date", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  const date = c.req.param("date");
  if (!isDateKey(date)) return c.json({ error: "Fecha inválida." }, 400);
  const body = await readJson(c.req.raw, MAX_JSON_BYTES.day);
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
  return c.json(await dayPayload(c.env, date, log, plan.training.weekCount));
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
  const loads = coerceLoads(body, plan.training.weekCount);
  await c.env.PLAN_KV.put(LOADS_KEY, JSON.stringify(loads));
  return c.json(loads);
});

app.post("/api/advise", async (c) => {
  const denied = await requireAuth(c);
  if (denied) return denied;
  if (!c.env.AI) {
    return c.json({ error: "Workers AI no está configurado." }, 503);
  }
  const body = (await readJson(c.req.raw, MAX_JSON_BYTES.advise)) as {
    date?: unknown;
    question?: unknown;
  } | null;
  const date = typeof body?.date === "string" ? body.date : "";
  const question = (typeof body?.question === "string" ? body.question : "").trim().slice(0, 500);
  if (!isDateKey(date)) return c.json({ error: "Fecha inválida." }, 400);
  if (question.length < 4) return c.json({ error: "Escribe una pregunta un poco más clara." }, 400);

  const plan = await readPlan(c.env);
  const dates = weekDates(date);
  const storedLogs = await Promise.all(dates.map((day) => c.env.PLAN_KV.get(`log:${day}`, "json")));
  const logs = dates.map((day, index) => coerceLog(storedLogs[index], day) ?? emptyLog(day));
  const period = payPeriodFor(date);
  const pantryStored = await c.env.PLAN_KV.get(`pantry:${period.id}`, "json");
  const pantry = coercePantry(pantryStored, period.id);

  try {
    const text = await runAdvice(c.env.AI, { plan, date, question, logs, pantry, period });
    return c.json({ text });
  } catch {
    return c.json({ error: "No se pudo consultar a la IA." }, 502);
  }
});

app.all("/api/*", (c) => c.json({ error: "No encontrado." }, 404));

export default app;
