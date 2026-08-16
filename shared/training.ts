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

export const TRAINING_CONTENT_VERSION = 7;

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

export type ExerciseLoad = {
  weight: string;
  unit: LoadUnit;
  note: string;
};

export type TrainingLoads = {
  byExercise: Record<string, ExerciseLoad[]>;
};

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

export function emptyLoad(): ExerciseLoad {
  return { weight: "", unit: "kg", note: "" };
}

export function emptyLoads(): TrainingLoads {
  return { byExercise: {} };
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
    notes: source.notes.filter((note) => typeof note === "string").map((note) => note.slice(0, 500)),
    systems: source.systems.map((item) => ({
      ...item,
      name: item.name.slice(0, 80),
      example: item.example.slice(0, 160),
      body: item.body.slice(0, 800),
    })),
    rmNotes: source.rmNotes.map((item) => ({
      ...item,
      title: item.title.slice(0, 80),
      body: item.body.slice(0, 500),
    })),
    sessions: source.sessions.map((session) => ({
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
      exercises: session.exercises.map((exercise) => ({
        ...exercise,
        name: exercise.name.slice(0, 120),
        prescription: exercise.prescription.slice(0, 240),
        media: coerceMedia(exercise.media, seedMedia.get(exercise.id)),
      })),
    })),
    cardioOptions: source.cardioOptions
      .filter((item) => typeof item === "string")
      .map((item) => item.slice(0, 160)),
    cardioWeekdays: source.cardioWeekdays.filter((day) => day >= 0 && day <= 6),
  };
}

export function parseLoad(value: unknown): ExerciseLoad {
  if (value && typeof value === "object") {
    const row = value as Partial<ExerciseLoad>;
    return {
      weight: sanitizeWeight(typeof row.weight === "string" ? row.weight : ""),
      unit: row.unit === "lb" ? "lb" : "kg",
      note: typeof row.note === "string" ? row.note.slice(0, 160) : "",
    };
  }
  if (typeof value !== "string") return emptyLoad();
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|lb|lbs|libra|libras)?$/i);
  if (match) {
    return {
      weight: sanitizeWeight(match[1]),
      unit: match[2] && /^lb/i.test(match[2]) ? "lb" : "kg",
      note: "",
    };
  }
  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return { weight: sanitizeWeight(trimmed), unit: "kg", note: "" };
  }
  return { weight: "", unit: "kg", note: trimmed.slice(0, 160) };
}

function sanitizeWeight(value: string): string {
  const next = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  const decimals = rest.join("").slice(0, 2);
  const joined = rest.length ? `${whole.slice(0, 5)}.${decimals}` : whole.slice(0, 5);
  return joined.slice(0, 8);
}

export function coerceLoads(value: unknown, weekCount = DEFAULT_TRAINING_WEEKS): TrainingLoads {
  if (value === null || typeof value !== "object") return emptyLoads();
  const raw = (value as { byExercise?: unknown }).byExercise;
  if (raw === null || typeof raw !== "object") return emptyLoads();
  const weeks = Math.max(1, Math.min(12, weekCount));
  const byExercise: Record<string, ExerciseLoad[]> = {};
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || id.length > 80) continue;
    const values = Array.isArray(row) ? row : [];
    byExercise[id] = Array.from({ length: weeks }, (_, index) => parseLoad(values[index]));
  }
  return { byExercise };
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
): TrainingLoads {
  const weeks = Math.max(1, Math.min(12, weekCount));
  const current = loads.byExercise[exerciseId] ?? Array.from({ length: weeks }, () => emptyLoad());
  const next = current.slice(0, weeks);
  while (next.length < weeks) next.push(emptyLoad());
  next[weekIndex(week)] = parseLoad(value);
  return {
    byExercise: {
      ...loads.byExercise,
      [exerciseId]: next,
    },
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
