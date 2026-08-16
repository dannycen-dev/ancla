export type DietBreak = {
  id: string;
  text: string;
};

export type DayLog = {
  date: string;
  doneSlotIds: string[];
  waterHalves: number;
  extraWaterHalves: number;
  zeroCalDrink: boolean;
  freeMeal: boolean;
  freeMealNote: string;
  dietBreaks: DietBreak[];
  doneExerciseIds: string[];
  doneSessionIds: string[];
  cardioDone: boolean;
  gymStartedAt: string | null;
  gymEndedAt: string | null;
};

export const WATER_GOAL_HALVES = 7;
export const ZERO_CAL_WEEK_GOAL = 4;
export const FREE_MEAL_WEEK_GOAL = 3;
export const GREEN_MEAL_GOAL = 2;

export function emptyLog(date: string): DayLog {
  return {
    date,
    doneSlotIds: [],
    waterHalves: 0,
    extraWaterHalves: 0,
    zeroCalDrink: false,
    freeMeal: false,
    freeMealNote: "",
    dietBreaks: [],
    doneExerciseIds: [],
    doneSessionIds: [],
    cardioDone: false,
    gymStartedAt: null,
    gymEndedAt: null,
  };
}

export function emptyBreak(): DietBreak {
  return { id: crypto.randomUUID(), text: "" };
}

export function liters(halves: number): string {
  const value = halves * 0.5;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function coerceBreaks(value: unknown): DietBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is DietBreak => {
      if (item === null || typeof item !== "object") return false;
      const row = item as Partial<DietBreak>;
      return typeof row.id === "string" && typeof row.text === "string";
    })
    .map((item) => ({ id: item.id, text: item.text.slice(0, 400) }))
    .slice(0, 12);
}

export function coerceLog(value: unknown, date: string): DayLog | null {
  if (value === null || typeof value !== "object") return null;
  const log = value as Partial<DayLog>;
  if (!Array.isArray(log.doneSlotIds) || !log.doneSlotIds.every((id) => typeof id === "string")) {
    return null;
  }
  if (typeof log.waterHalves !== "number" || typeof log.extraWaterHalves !== "number") return null;
  if (typeof log.zeroCalDrink !== "boolean") return null;
  return {
    date,
    doneSlotIds: log.doneSlotIds,
    waterHalves: log.waterHalves,
    extraWaterHalves: log.extraWaterHalves,
    zeroCalDrink: log.zeroCalDrink,
    freeMeal: Boolean(log.freeMeal),
    freeMealNote: typeof log.freeMealNote === "string" ? log.freeMealNote.slice(0, 400) : "",
    dietBreaks: coerceBreaks(log.dietBreaks),
    doneExerciseIds: coerceIdList(log.doneExerciseIds),
    doneSessionIds: coerceIdList(log.doneSessionIds),
    cardioDone: Boolean(log.cardioDone),
    gymStartedAt: coerceStamp(log.gymStartedAt),
    gymEndedAt: coerceStamp(log.gymEndedAt),
  };
}

function coerceIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 80).slice(0, 80);
}

function coerceStamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10 || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function clockFromStamp(stamp: string | null): string {
  if (!stamp) return "";
  const date = new Date(stamp);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function stampFromDateAndClock(date: string, clock: string): string | null {
  if (!isDateKey(date) || !/^\d{2}:\d{2}$/.test(clock)) return null;
  const [hour, minute] = clock.split(":").map(Number);
  const next = new Date(`${date}T00:00:00`);
  next.setHours(hour, minute, 0, 0);
  return Number.isFinite(next.getTime()) ? next.toISOString() : null;
}

export function gymDurationMinutes(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const minutes = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function isDayLog(value: unknown): value is DayLog {
  return coerceLog(value, typeof value === "object" && value && "date" in value && typeof value.date === "string" ? value.date : "") !== null;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
