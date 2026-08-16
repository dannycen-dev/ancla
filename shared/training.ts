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

export type TrainingPlan = {
  startedOn: string;
  weekCount: number;
  notes: string[];
  systems: TrainingSystem[];
  rmNotes: RmNote[];
  sessions: TrainingSession[];
  cardioOptions: string[];
  cardioWeekdays: number[];
};

export type TrainingLoads = {
  byExercise: Record<string, string[]>;
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

export function emptyLoads(): TrainingLoads {
  return { byExercise: {} };
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
    (item.systemId === null || typeof item.systemId === "string")
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
  return {
    ...plan,
    startedOn:
      typeof plan.startedOn === "string" && isDateKey(plan.startedOn)
        ? plan.startedOn
        : fallback.startedOn,
    weekCount:
      Number.isFinite(plan.weekCount) && plan.weekCount > 0
        ? Math.min(12, Math.round(plan.weekCount))
        : fallback.weekCount,
    notes: plan.notes.filter((note) => typeof note === "string").map((note) => note.slice(0, 500)),
    systems: plan.systems.map((item) => ({
      ...item,
      name: item.name.slice(0, 80),
      example: item.example.slice(0, 160),
      body: item.body.slice(0, 800),
    })),
    rmNotes: plan.rmNotes.map((item) => ({
      ...item,
      title: item.title.slice(0, 80),
      body: item.body.slice(0, 500),
    })),
    sessions: plan.sessions.map((session) => ({
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
      })),
    })),
    cardioOptions: plan.cardioOptions
      .filter((item) => typeof item === "string")
      .map((item) => item.slice(0, 160)),
    cardioWeekdays: plan.cardioWeekdays.filter((day) => day >= 0 && day <= 6),
  };
}

export function coerceLoads(value: unknown, weekCount = DEFAULT_TRAINING_WEEKS): TrainingLoads {
  if (value === null || typeof value !== "object") return emptyLoads();
  const raw = (value as { byExercise?: unknown }).byExercise;
  if (raw === null || typeof raw !== "object") return emptyLoads();
  const weeks = Math.max(1, Math.min(12, weekCount));
  const byExercise: Record<string, string[]> = {};
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || id.length > 80) continue;
    const values = Array.isArray(row) ? row : [];
    byExercise[id] = Array.from({ length: weeks }, (_, index) =>
      typeof values[index] === "string" ? values[index].slice(0, 32) : "",
    );
  }
  return { byExercise };
}

export function loadForWeek(loads: TrainingLoads, exerciseId: string, week: number): string {
  return loads.byExercise[exerciseId]?.[weekIndex(week)] ?? "";
}

export function setLoad(
  loads: TrainingLoads,
  exerciseId: string,
  week: number,
  value: string,
  weekCount = DEFAULT_TRAINING_WEEKS,
): TrainingLoads {
  const weeks = Math.max(1, Math.min(12, weekCount));
  const current = loads.byExercise[exerciseId] ?? Array.from({ length: weeks }, () => "");
  const next = current.slice(0, weeks);
  while (next.length < weeks) next.push("");
  next[weekIndex(week)] = value.slice(0, 32);
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
