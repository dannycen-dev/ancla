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
  };
}

function coerceIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 80).slice(0, 80);
}

export function isDayLog(value: unknown): value is DayLog {
  return coerceLog(value, typeof value === "object" && value && "date" in value && typeof value.date === "string" ? value.date : "") !== null;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
