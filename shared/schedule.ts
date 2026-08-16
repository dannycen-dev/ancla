const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

const DAY_SHORT = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"] as const;

/** Lunes = 0 … Domingo = 6, para rotar las 4 variaciones. */
export function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function variationIndex(jsDay: number, optionCount: number): number {
  if (optionCount <= 0) return 0;
  return mondayIndex(jsDay) % optionCount;
}

export function dayName(jsDay: number): string {
  return DAY_NAMES[jsDay] ?? DAY_NAMES[0];
}

export function dayShort(jsDay: number): string {
  return DAY_SHORT[jsDay] ?? DAY_SHORT[0];
}

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function formatTime12(time: string): string {
  const [hourText, minuteText = "00"] = time.split(":");
  const hour24 = Number(hourText);
  if (!Number.isFinite(hour24)) return time;
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${meridiem}`;
}

export function toTime24(hour12: number, minute: number, meridiem: "am" | "pm"): string {
  let hour24 = hour12 % 12;
  if (meridiem === "pm") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function partsFromTime(time: string): { hour12: number; minute: number; meridiem: "am" | "pm" } {
  const [hourText, minuteText = "00"] = time.split(":");
  const hour24 = Number(hourText) || 0;
  const minute = Number(minuteText) || 0;
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, meridiem };
}

export function localDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** La semana de gym corta el lunes a esta hora local, para incluir el RM del fin de semana. */
export const TRAINING_WEEK_CUTOVER_HOUR = 1;

export function trainingDateISO(now = new Date()): string {
  const date = new Date(now.getTime());
  if (date.getDay() === 1 && date.getHours() < TRAINING_WEEK_CUTOVER_HOUR) {
    date.setDate(date.getDate() - 1);
  }
  return localDateISO(date);
}

export function dateForWeekday(jsDay: number, from = new Date()): string {
  const base = new Date(from);
  base.setHours(12, 0, 0, 0);
  const monday = new Date(base);
  monday.setDate(base.getDate() - mondayIndex(base.getDay()));
  const target = new Date(monday);
  target.setDate(monday.getDate() + mondayIndex(jsDay));
  return localDateISO(target);
}

export function weekDates(dateStr: string): string[] {
  return WEEK_ORDER.map((jsDay) => dateForWeekday(jsDay, parseISODate(dateStr)));
}

export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12);
}

export function weekdayFromISO(dateStr: string): number {
  return parseISODate(dateStr).getDay();
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = parseISODate(from);
  const end = parseISODate(to);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime()) || current > end) return dates;
  while (current <= end) {
    dates.push(localDateISO(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function addDays(dateStr: string, amount: number): string {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() + amount);
  return localDateISO(date);
}

export function daysBetween(from: string, to: string): number {
  const start = parseISODate(from).getTime();
  const end = parseISODate(to).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function formatDayLong(dateStr: string): string {
  return parseISODate(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
  });
}

export function monthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

export function monthsBetween(from: string, to: string): { year: number; month: number }[] {
  const start = parseISODate(from);
  const end = parseISODate(to);
  const months: { year: number; month: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function sortSlots<T extends { time: string; title: string }>(slots: T[]): T[] {
  return [...slots].sort((a, b) => {
    const byTime = minutesFromTime(a.time) - minutesFromTime(b.time);
    return byTime !== 0 ? byTime : a.title.localeCompare(b.title, "es");
  });
}

export function formatClock(date: Date): string {
  const hour24 = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${meridiem}`;
}

export function formatNowLong(date: Date): string {
  const weekday = dayName(date.getDay());
  const day = date.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  return `${weekday} ${day} · ${formatClock(date)}`;
}

export type NowPhase = "before" | "current" | "done";

export type NowStatus<T extends { id: string; time: string; title: string }> = {
  phase: NowPhase;
  current: T | null;
  next: T | null;
  currentId: string | null;
};

export function nowStatus<T extends { id: string; time: string; title: string }>(
  slots: T[],
  now = new Date(),
): NowStatus<T> {
  const sorted = sortSlots(slots);
  if (sorted.length === 0) {
    return { phase: "done", current: null, next: null, currentId: null };
  }
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const first = minutesFromTime(sorted[0].time);
  if (nowMins < first) {
    return { phase: "before", current: null, next: sorted[0], currentId: null };
  }
  let index = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (minutesFromTime(sorted[i].time) <= nowMins) index = i;
  }
  const current = sorted[index];
  const next = sorted[index + 1] ?? null;
  const windowEnd = next ? minutesFromTime(next.time) : minutesFromTime(current.time) + 90;
  if (!next && nowMins >= windowEnd) {
    return { phase: "done", current: null, next: null, currentId: null };
  }
  return { phase: "current", current, next, currentId: current.id };
}

export function nowMessage<T extends { id: string; time: string; title: string }>(
  status: NowStatus<T>,
): string {
  if (status.phase === "before" && status.next) {
    return `El día empieza a las ${formatTime12(status.next.time)} · ${status.next.title}`;
  }
  if (status.phase === "current" && status.current && status.next) {
    return `Ahora: ${status.current.title}. Siguiente a las ${formatTime12(status.next.time)}: ${status.next.title}`;
  }
  if (status.phase === "current" && status.current) {
    return `Ahora: ${status.current.title}`;
  }
  return "Hoy ya cerró el plan";
}
