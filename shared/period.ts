import { isDateKey } from "./log.ts";
import { addDays, eachDate, formatDayLong, localDateISO, parseISODate } from "./schedule.ts";

export type PayPeriod = {
  id: string;
  start: string;
  end: string;
  payday: string;
  payLabel: string;
  days: number;
};

function ymd(year: number, monthIndex: number, day: number): string {
  return localDateISO(new Date(year, monthIndex, day, 12));
}

function paydayThirty(year: number, monthIndex: number): string {
  const last = new Date(year, monthIndex + 1, 0, 12);
  const day = Math.min(30, last.getDate());
  return ymd(year, monthIndex, day);
}

function payLabel(payday: string, kind: "15" | "30"): string {
  const day = parseISODate(payday).getDate();
  if (kind === "15") return "Pago del 15";
  return day === 30 ? "Pago del 30" : `Pago del ${day}`;
}

export function payPeriodFor(dateStr: string): PayPeriod {
  const date = parseISODate(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (day <= 15) {
    const start = ymd(year, month, 1);
    const end = ymd(year, month, 15);
    const prev = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const payday = paydayThirty(prevYear, prev);
    return makePeriod(start, end, payday, payLabel(payday, "30"));
  }

  const start = ymd(year, month, 16);
  const last = new Date(year, month + 1, 0, 12);
  const end = localDateISO(last);
  const payday = ymd(year, month, 15);
  return makePeriod(start, end, payday, payLabel(payday, "15"));
}

function makePeriod(start: string, end: string, payday: string, payLabelText: string): PayPeriod {
  return {
    id: `${start}_${end}`,
    start,
    end,
    payday,
    payLabel: payLabelText,
    days: eachDate(start, end).length,
  };
}

export function shiftPeriod(period: PayPeriod, direction: -1 | 1): PayPeriod {
  return payPeriodFor(direction === 1 ? addDays(period.end, 1) : addDays(period.start, -1));
}

export function parsePeriodId(value: string): PayPeriod | null {
  const [start, end] = value.split("_");
  if (!start || !end || !isDateKey(start) || !isDateKey(end)) return null;
  const period = payPeriodFor(start);
  if (period.id !== value) return null;
  return period;
}

export function dateInPeriod(period: PayPeriod, date: string): boolean {
  return date >= period.start && date <= period.end;
}

export function periodTitle(period: PayPeriod): string {
  return `${formatDayLong(period.start)} — ${formatDayLong(period.end)}`;
}
