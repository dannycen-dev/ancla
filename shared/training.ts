import { isDateKey } from "./log.ts";
import { daysBetween, weekdayFromISO } from "./schedule.ts";

export const DEFAULT_TRAINING_STARTED_ON = "2026-08-17";
export const DEFAULT_TRAINING_WEEKS = 4;
export const WEEKDAY_OPTIONS = [
  { jsDay: 1, label: "Lun" },
  { jsDay: 2, label: "Mar" },
  { jsDay: 3, label: "Mié" },
  { jsDay: 4, label: "Jue" },
  { jsDay: 5, label: "Vie" },
  { jsDay: 6, label: "Sáb" },
  { jsDay: 0, label: "Dom" },
] as const;

export type TrainingBlock = "fuerza" | "hipertrofia" | "accesorio" | "cardio";

export type TrainingSystem = {
  id: string;
  name: string;
  example: string;
  body: string;
};

export type RmNote = {
  id: string;
  percent: number;
  title: string;
  body: string;
};

export type TrainingExercise = {
  id: string;
  name: string;
  prescription: string;
  systemId: string | null;
  media: string[];
};

export type TrainingSession = {
  id: string;
  label: string;
  focus: string;
  block: TrainingBlock;
  weekdays: number[];
  weeks: number[];
  weeklyGoal: number | null;
  exercises: TrainingExercise[];
};

export const TRAINING_CONTENT_VERSION = 8;

export type TrainingPlan = {
  startedOn: string;
  weekCount: number;
  contentVersion: number;
  notes: string[];
  systems: TrainingSystem[];
  rmNotes: RmNote[];
  sessions: TrainingSession[];
  cardioOptions: string[];
  cardioWeekdays: number[];
};

export type LoadUnit = "kg" | "lb";

export type SetLoad = {
  weight: string;
  unit: LoadUnit;
};

export type ExerciseLoad = {
  note: string;
  sets: SetLoad[];
};

export type SetSlot = {
  key: string;
  label: string;
  hint?: string;
};

export type LoadSnapshot = {
  date: string;
  exerciseId: string;
  week: number;
  note: string;
  sets: SetLoad[];
};

export type RmEntry = {
  id: string;
  name: string;
  date: string;
  week: number;
  weight: string;
  reps: number;
  unit: LoadUnit;
  estimatedRm: number;
};

export type TrainingLoads = {
  byExercise: Record<string, ExerciseLoad[]>;
  history: LoadSnapshot[];
  rms: RmEntry[];
};

export const LOAD_HISTORY_CAP = 400;
export const LOAD_RM_CAP = 80;

export const BLOCK_LABEL: Record<TrainingBlock, string> = {
  fuerza: "Bloque 1 · Fuerza",
  hipertrofia: "Bloque 2 · Hipertrofia",
  accesorio: "Accesorio",
  cardio: "Cardio opcional",
};

const BLOCKS = new Set<TrainingBlock>(["fuerza", "hipertrofia", "accesorio", "cardio"]);

export function emptyExercise(): TrainingExercise {
  return {
    id: crypto.randomUUID(),
    name: "Nuevo ejercicio",
    prescription: "3x10",
    systemId: null,
    media: [],
  };
}

export function emptySession(): TrainingSession {
  return {
    id: crypto.randomUUID(),
    label: "Día nuevo",
    focus: "Grupo muscular",
    block: "fuerza",
    weekdays: [1],
    weeks: [1, 2, 3, 4],
    weeklyGoal: null,
    exercises: [emptyExercise()],
  };
}

export function emptySystem(): TrainingSystem {
  return {
    id: crypto.randomUUID(),
    name: "Sistema",
    example: "",
    body: "",
  };
}

export function emptyRmNote(): RmNote {
  return {
    id: crypto.randomUUID(),
    percent: 70,
    title: "70% RM",
    body: "",
  };
}

export function emptySetLoad(unit: LoadUnit = "kg"): SetLoad {
  return { weight: "", unit };
}

export function emptyLoad(): ExerciseLoad {
  return { note: "", sets: [] };
}

export function emptyLoads(): TrainingLoads {
  return { byExercise: {}, history: [], rms: [] };
}

export function loadHasData(load: ExerciseLoad): boolean {
  return Boolean(load.note.trim()) || load.sets.some((set) => set.weight.trim());
}

function asMediaList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function coerceMedia(value: unknown, fallback: string[] = []): string[] {
  const cleaned = asMediaList(value)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("/exercises/"))
    .map((item) => item.slice(0, 160));
  if (fallback.length > cleaned.length) return fallback;
  return cleaned.length ? cleaned : fallback;
}

export function mediaCaption(src: string): string {
  const stem = src.replace(/^\/exercises\//, "").replace(/\.[^.]+$/, "");
  return stem.replace(/-/g, " ");
}

export function cycleWeek(date: string, startedOn: string, weekCount: number): number {
  const count = Math.max(1, weekCount);
  const days = daysBetween(startedOn, date);
  if (days < 0) return 1;
  return (Math.floor(days / 7) % count) + 1;
}

export function isBeforeStart(date: string, startedOn: string): boolean {
  return daysBetween(startedOn, date) < 0;
}

export function weekIndex(week: number): number {
  return Math.max(0, week - 1);
}

function isExercise(value: unknown): value is TrainingExercise {
  if (value === null || typeof value !== "object") return false;
  const item = value as Partial<TrainingExercise>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.prescription === "string" &&
    (item.systemId === null || typeof item.systemId === "string") &&
    (item.media === undefined ||
      item.media === null ||
      typeof item.media === "string" ||
      (Array.isArray(item.media) && item.media.every((path) => typeof path === "string")))
  );
}

function isSession(value: unknown): value is TrainingSession {
  if (value === null || typeof value !== "object") return false;
  const item = value as Partial<TrainingSession>;
  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    typeof item.focus === "string" &&
    typeof item.block === "string" &&
    BLOCKS.has(item.block as TrainingBlock) &&
    Array.isArray(item.weekdays) &&
    item.weekdays.every((day) => typeof day === "number") &&
    Array.isArray(item.weeks) &&
    item.weeks.every((week) => typeof week === "number") &&
    Array.isArray(item.exercises) &&
    item.exercises.every(isExercise)
  );
}

export function isTrainingPlan(value: unknown): value is TrainingPlan {
  if (value === null || typeof value !== "object") return false;
  const plan = value as Partial<TrainingPlan>;
  return (
    typeof plan.startedOn === "string" &&
    typeof plan.weekCount === "number" &&
    Array.isArray(plan.notes) &&
    Array.isArray(plan.systems) &&
    Array.isArray(plan.rmNotes) &&
    Array.isArray(plan.sessions) &&
    plan.sessions.every(isSession) &&
    Array.isArray(plan.cardioOptions) &&
    Array.isArray(plan.cardioWeekdays)
  );
}

export function normalizeTraining(plan: TrainingPlan, fallback: TrainingPlan): TrainingPlan {
  const storedVersion = typeof plan.contentVersion === "number" ? plan.contentVersion : 0;
  const source = storedVersion < TRAINING_CONTENT_VERSION ? fallback : plan;
  const seedMedia = new Map<string, string[]>();
  for (const session of fallback.sessions) {
    for (const exercise of session.exercises) {
      if (exercise.media.length) seedMedia.set(exercise.id, exercise.media);
    }
  }
  return {
    ...source,
    contentVersion: TRAINING_CONTENT_VERSION,
    startedOn:
      typeof plan.startedOn === "string" && isDateKey(plan.startedOn)
        ? plan.startedOn
        : fallback.startedOn,
    weekCount:
      Number.isFinite(source.weekCount) && source.weekCount > 0
        ? Math.min(12, Math.round(source.weekCount))
        : fallback.weekCount,
    notes: source.notes.filter((note) => typeof note === "string").map((note) => note.slice(0, 500)).slice(0, 40),
    systems: source.systems.slice(0, 40).map((item) => ({
      ...item,
      name: item.name.slice(0, 80),
      example: item.example.slice(0, 160),
      body: item.body.slice(0, 800),
    })),
    rmNotes: source.rmNotes.slice(0, 40).map((item) => ({
      ...item,
      title: item.title.slice(0, 80),
      body: item.body.slice(0, 500),
    })),
    sessions: source.sessions.slice(0, 40).map((session) => ({
      ...session,
      id: session.id || crypto.randomUUID(),
      label: session.label.slice(0, 80),
      focus: session.focus.slice(0, 120),
      weekdays: session.weekdays.filter((day) => day >= 0 && day <= 6),
      weeks: session.weeks.filter((week) => week >= 1 && week <= 12),
      weeklyGoal:
        typeof session.weeklyGoal === "number" && session.weeklyGoal > 0
          ? Math.min(7, Math.round(session.weeklyGoal))
          : null,
      exercises: session.exercises.slice(0, 40).map((exercise) => ({
        ...exercise,
        name: exercise.name.slice(0, 120),
        prescription: exercise.prescription.slice(0, 240),
        media: coerceMedia(exercise.media, seedMedia.get(exercise.id)),
      })),
    })),
    cardioOptions: source.cardioOptions
      .filter((item) => typeof item === "string")
      .map((item) => item.slice(0, 160))
      .slice(0, 20),
    cardioWeekdays: source.cardioWeekdays.filter((day) => day >= 0 && day <= 6),
  };
}

export function parseLoad(value: unknown): ExerciseLoad {
  if (value && typeof value === "object") {
    const row = value as { note?: unknown; sets?: unknown; weight?: unknown; unit?: unknown };
    const note = typeof row.note === "string" ? row.note.slice(0, 160) : "";
    if (Array.isArray(row.sets)) {
      return { note, sets: row.sets.slice(0, 10).map(coerceSetLoad) };
    }
    const unit: LoadUnit = row.unit === "lb" ? "lb" : "kg";
    const weight = sanitizeWeight(typeof row.weight === "string" ? row.weight : "");
    return { note, sets: weight ? [{ weight, unit }] : [] };
  }
  if (typeof value !== "string") return emptyLoad();
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|lb|lbs|libra|libras)?$/i);
  if (match) {
    return {
      note: "",
      sets: [
        {
          weight: sanitizeWeight(match[1]),
          unit: match[2] && /^lb/i.test(match[2]) ? "lb" : "kg",
        },
      ],
    };
  }
  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return { note: "", sets: [{ weight: sanitizeWeight(trimmed), unit: "kg" }] };
  }
  return { note: trimmed.slice(0, 160), sets: [] };
}

function coerceSetLoad(value: unknown): SetLoad {
  if (value && typeof value === "object") {
    const row = value as Partial<SetLoad>;
    return {
      weight: sanitizeWeight(typeof row.weight === "string" ? row.weight : ""),
      unit: row.unit === "lb" ? "lb" : "kg",
    };
  }
  if (typeof value === "string") {
    const parsed = parseLoad(value);
    return parsed.sets[0] ?? emptySetLoad();
  }
  return emptySetLoad();
}

export function setsForSlots(load: ExerciseLoad, count: number): SetLoad[] {
  const size = Math.max(1, Math.min(10, count));
  const sets = load.sets.slice(0, size).map(coerceSetLoad);
  const unit = sets[0]?.unit ?? "kg";
  while (sets.length < size) sets.push(emptySetLoad(unit));
  return sets;
}

function peelTrailingParen(text: string): { body: string; note: string } {
  const match = text.match(/^(.*)\s*\(([^)]+)\)\s*$/);
  if (!match || !match[1].trim()) return { body: text.trim(), note: "" };
  return { body: match[1].trim(), note: match[2].trim() };
}

function formatSetRest(rest: string): string {
  const cleaned = rest.replace(/^serie\b/i, "").trim();
  if (!cleaned) return "reps";
  if (/^\d+$/.test(cleaned)) return `${cleaned} reps`;
  return cleaned;
}

function isLongSetNote(note: string): boolean {
  return note.length > 18 || /descanso|menos peso|segundos/i.test(note);
}

export function parseSetSlots(prescription: string): SetSlot[] {
  const parts = splitTopLevel(prescription);
  const slots: SetSlot[] = [];
  let index = 1;
  for (const part of parts) {
    const drop = part.match(/^(\d+)\s*[xX]\s*\(([\d\s,]+)\)$/);
    if (drop) {
      const rounds = Math.min(6, Number(drop[1]) || 1);
      const drops = drop[2]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4);
      for (let round = 1; round <= rounds; round++) {
        for (const reps of drops) {
          slots.push({
            key: `s${index}`,
            label: rounds > 1 ? `Ronda ${round} · ${reps} reps` : `${reps} reps`,
          });
          index += 1;
        }
      }
      continue;
    }
    const counted = part.match(/^(\d+)\s*[xX]\s*(.*)$/i);
    if (counted) {
      const count = Math.min(8, Math.max(1, Number(counted[1]) || 1));
      if (count === 1) {
        slots.push({ key: `s${index}`, label: part });
        index += 1;
      } else {
        const peeled = peelTrailingParen(counted[2]);
        const restLabel = formatSetRest(peeled.body);
        const hint = peeled.note && isLongSetNote(peeled.note) ? peeled.note : "";
        const shortNote = peeled.note && !hint ? peeled.note : "";
        for (let set = 1; set <= count; set++) {
          slots.push({
            key: `s${index}`,
            label: `Serie ${set}/${count} · ${restLabel}${shortNote ? ` · ${shortNote}` : ""}`,
            hint: set === 1 && hint ? hint : undefined,
          });
          index += 1;
        }
      }
      continue;
    }
    slots.push({ key: `s${index}`, label: part });
    index += 1;
  }
  return slots.length > 0 ? slots.slice(0, 10) : [{ key: "s1", label: prescription || "Peso" }];
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;
    if (char === "," && depth === 0) {
      const piece = buffer.trim();
      if (piece) parts.push(piece);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  const piece = buffer.trim();
  if (piece) parts.push(piece);
  return parts;
}

function sanitizeWeight(value: string): string {
  const next = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  const decimals = rest.join("").slice(0, 2);
  const joined = rest.length ? `${whole.slice(0, 5)}.${decimals}` : whole.slice(0, 5);
  return joined.slice(0, 8);
}

function coerceSnapshot(value: unknown): LoadSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LoadSnapshot>;
  if (typeof row.date !== "string" || !isDateKey(row.date)) return null;
  if (typeof row.exerciseId !== "string" || !row.exerciseId || row.exerciseId.length > 80) return null;
  const week = typeof row.week === "number" && Number.isFinite(row.week) ? Math.round(row.week) : 0;
  if (week < 1 || week > 12) return null;
  const load = parseLoad({ note: row.note, sets: row.sets });
  return { date: row.date, exerciseId: row.exerciseId, week, note: load.note, sets: load.sets };
}

function coerceHistory(value: unknown): LoadSnapshot[] {
  if (!Array.isArray(value)) return [];
  const next: LoadSnapshot[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of value) {
    const snap = coerceSnapshot(item);
    if (!snap) continue;
    const key = `${snap.date}:${snap.exerciseId}`;
    const existing = indexByKey.get(key);
    if (existing != null) {
      next[existing] = snap;
      continue;
    }
    indexByKey.set(key, next.length);
    next.push(snap);
  }
  return next.slice(-LOAD_HISTORY_CAP);
}

function coerceRmEntry(value: unknown): RmEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RmEntry> & { estimatedRm?: unknown; reps?: unknown };
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim().slice(0, 80) : "manual";
  const name = typeof row.name === "string" ? row.name.trim().slice(0, 80) : "";
  if (typeof row.date !== "string" || !isDateKey(row.date)) return null;
  const week = typeof row.week === "number" && Number.isFinite(row.week) ? Math.round(row.week) : 0;
  if (week < 1 || week > 12) return null;
  const unit: LoadUnit = row.unit === "lb" ? "lb" : "kg";
  const weight = sanitizeWeight(typeof row.weight === "string" ? row.weight : "");
  const reps = typeof row.reps === "number" && Number.isInteger(row.reps) ? row.reps : 0;
  const estimatedRm =
    typeof row.estimatedRm === "number" && Number.isFinite(row.estimatedRm)
      ? Math.round(row.estimatedRm)
      : 0;
  if (!weight || reps < 1 || reps > 21 || estimatedRm < 1 || estimatedRm > 2000) return null;
  return { id, name, date: row.date, week, weight, reps, unit, estimatedRm };
}

function coerceRms(value: unknown): RmEntry[] {
  if (!Array.isArray(value)) return [];
  const next: RmEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const entry = coerceRmEntry(item);
    if (!entry) continue;
    const key = `${entry.week}:${entry.id}:${entry.name.toLowerCase()}:${entry.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(entry);
    if (next.length >= LOAD_RM_CAP) break;
  }
  return next;
}

function upsertHistory(
  history: LoadSnapshot[],
  snap: LoadSnapshot,
): LoadSnapshot[] {
  const key = `${snap.date}:${snap.exerciseId}`;
  const next = history.filter((item) => `${item.date}:${item.exerciseId}` !== key);
  if (loadHasData({ note: snap.note, sets: snap.sets })) next.push(snap);
  return next.slice(-LOAD_HISTORY_CAP);
}

export function coerceLoads(value: unknown, weekCount = DEFAULT_TRAINING_WEEKS): TrainingLoads {
  if (value === null || typeof value !== "object") return emptyLoads();
  const row = value as { byExercise?: unknown; history?: unknown; rms?: unknown };
  const weeks = Math.max(1, Math.min(12, weekCount));
  const byExercise: Record<string, ExerciseLoad[]> = {};
  if (row.byExercise && typeof row.byExercise === "object") {
    for (const [id, weekRow] of Object.entries(row.byExercise as Record<string, unknown>).slice(0, 200)) {
      if (typeof id !== "string" || id.length > 80) continue;
      const values = Array.isArray(weekRow) ? weekRow : [];
      byExercise[id] = Array.from({ length: weeks }, (_, index) => parseLoad(values[index]));
    }
  }
  return {
    byExercise,
    history: coerceHistory(row.history),
    rms: coerceRms(row.rms),
  };
}

export function mergeLoads(current: TrainingLoads, incoming: TrainingLoads): TrainingLoads {
  return {
    byExercise: { ...current.byExercise, ...incoming.byExercise },
    history:
      incoming.history.length === 0 && current.history.length > 0
        ? current.history
        : coerceHistory([...current.history, ...incoming.history]),
    rms: incoming.rms.length === 0 && current.rms.length > 0 ? current.rms : coerceRms([...incoming.rms, ...current.rms]),
  };
}

export function loadForWeek(loads: TrainingLoads, exerciseId: string, week: number): ExerciseLoad {
  return loads.byExercise[exerciseId]?.[weekIndex(week)] ?? emptyLoad();
}

export function setLoad(
  loads: TrainingLoads,
  exerciseId: string,
  week: number,
  value: ExerciseLoad,
  weekCount = DEFAULT_TRAINING_WEEKS,
  date?: string,
): TrainingLoads {
  const weeks = Math.max(1, Math.min(12, weekCount));
  const current = loads.byExercise[exerciseId] ?? Array.from({ length: weeks }, () => emptyLoad());
  const next = current.slice(0, weeks);
  while (next.length < weeks) next.push(emptyLoad());
  const parsed = parseLoad(value);
  next[weekIndex(week)] = parsed;
  const history =
    date && isDateKey(date)
      ? upsertHistory(loads.history ?? [], {
          date,
          exerciseId,
          week,
          note: parsed.note,
          sets: parsed.sets,
        })
      : (loads.history ?? []);
  return {
    byExercise: {
      ...loads.byExercise,
      [exerciseId]: next,
    },
    history,
    rms: loads.rms ?? [],
  };
}

export function addRmEntry(loads: TrainingLoads, entry: RmEntry): TrainingLoads {
  const parsed = coerceRmEntry(entry);
  if (!parsed) {
    return {
      byExercise: loads.byExercise,
      history: loads.history ?? [],
      rms: loads.rms ?? [],
    };
  }
  const rms = [
    parsed,
    ...(loads.rms ?? []).filter((item) => {
      if (item.week !== parsed.week) return true;
      if (parsed.id !== "manual") return item.id !== parsed.id;
      return !(item.id === "manual" && item.date === parsed.date && item.name === parsed.name);
    }),
  ].slice(0, LOAD_RM_CAP);
  return {
    byExercise: loads.byExercise,
    history: loads.history ?? [],
    rms,
  };
}

export function mainSessionsForDate(plan: TrainingPlan, date: string): TrainingSession[] {
  const week = cycleWeek(date, plan.startedOn, plan.weekCount);
  const weekday = weekdayFromISO(date);
  return plan.sessions.filter(
    (session) =>
      (session.block === "fuerza" || session.block === "hipertrofia") &&
      session.weekdays.includes(weekday) &&
      (session.weeks.length === 0 || session.weeks.includes(week)),
  );
}

export function accessorySessions(plan: TrainingPlan): TrainingSession[] {
  return plan.sessions.filter((session) => session.block === "accesorio");
}

export function accessorySessionsForDate(plan: TrainingPlan, date: string): TrainingSession[] {
  const week = cycleWeek(date, plan.startedOn, plan.weekCount);
  const weekday = weekdayFromISO(date);
  return accessorySessions(plan).filter(
    (session) =>
      session.weekdays.includes(weekday) &&
      (session.weeks.length === 0 || session.weeks.includes(week)),
  );
}

export function weekdaySummary(days: number[]): string {
  const labels = WEEKDAY_OPTIONS.filter((day) => days.includes(day.jsDay)).map((day) => day.label);
  if (labels.length === 0) return "sin día";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}`;
}

export function isWeekendDay(date: string): boolean {
  const day = weekdayFromISO(date);
  return day === 0 || day === 6;
}

export function cardioApplies(plan: TrainingPlan, date: string): boolean {
  return plan.cardioWeekdays.includes(weekdayFromISO(date));
}

export function systemFor(plan: TrainingPlan, systemId: string | null): TrainingSystem | undefined {
  if (!systemId) return undefined;
  return plan.systems.find((item) => item.id === systemId);
}

export function exerciseIds(session: TrainingSession): string[] {
  return session.exercises.map((item) => item.id);
}
