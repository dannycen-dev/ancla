import { useEffect, useMemo, useState } from "react";
import { type DayLog } from "../shared/log.ts";
import type { Plan } from "../shared/plan.ts";
import { cycleStats } from "../shared/progress.ts";
import {
  WEEK_ORDER,
  dayShort,
  eachDate,
  formatDayLong,
  monthTitle,
  monthsBetween,
} from "../shared/schedule.ts";
import { loadRange } from "./api.ts";

type CalendarProps = {
  plan: Plan;
  selectedDate: string;
  todayIso: string;
  onSelectDate: (date: string) => void;
};

export function Calendar({ plan, selectedDate, todayIso, onSelectDate }: CalendarProps) {
  const today = todayIso;
  const [logs, setLogs] = useState<DayLog[]>([]);
  const rangeStart = plan.startedOn <= plan.consultOn ? plan.startedOn : plan.consultOn;
  const rangeEnd = plan.consultOn >= plan.startedOn ? plan.consultOn : plan.startedOn;

  useEffect(() => {
    let cancelled = false;
    void loadRange(rangeStart, rangeEnd).then((result) => {
      if (!cancelled) setLogs(result);
    });
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  const stats = useMemo(() => cycleStats(plan, logs, today), [plan, logs, today]);
  const byDate = useMemo(() => new Map(stats.scores.map((score) => [score.date, score])), [stats]);
  const months = monthsBetween(rangeStart, rangeEnd);

  return (
    <section className="progress">
      <p className="eyebrow">Hasta la consulta</p>
      <h1>{formatDayLong(plan.consultOn)}</h1>
      <p className="lede">
        Ciclo del {formatDayLong(plan.startedOn)} al {formatDayLong(plan.consultOn)}. Objetivo:
        recomposición corporal.
      </p>

      <div className="stat-grid">
        <article className="stat">
          <strong>{stats.mealPct}%</strong>
          <span>Comidas cumplidas</span>
        </article>
        <article className="stat">
          <strong>{stats.strongDays}</strong>
          <span>Días al 80%+</span>
        </article>
        <article className="stat">
          <strong>{stats.remaining}</strong>
          <span>{stats.remaining === 1 ? "Día para la consulta" : "Días para la consulta"}</span>
        </article>
      </div>

      <p className="meta">
        Agua 3.5 L en {stats.waterDays}/{stats.elapsed} días · Verdes 2/2 en {stats.greenDays}/
        {stats.elapsed} · {stats.mealDone}/{stats.mealTotal} comidas marcadas
      </p>

      {months.map(({ year, month }) => (
        <section key={`${year}-${month}`} className="month">
          <h2>{monthTitle(year, month)}</h2>
          <div className="cal-weekdays">
            {WEEK_ORDER.map((day) => (
              <span key={day}>{dayShort(day)}</span>
            ))}
          </div>
          <div className="cal-grid">
            {monthCells(year, month).map((cell, index) => {
              if (!cell) return <span key={`pad-${year}-${month}-${index}`} className="cal-pad" />;
              const score = byDate.get(cell);
              const inCycle = cell >= rangeStart && cell <= rangeEnd;
              const future = cell > today;
              const tone = !inCycle || !score || future ? "idle" : toneFor(score.pct, score.tracked);
              return (
                <button
                  key={cell}
                  type="button"
                  className={`cal-day is-${tone} ${cell === selectedDate ? "is-selected" : ""} ${cell === today ? "is-today" : ""} ${cell === plan.consultOn ? "is-consult" : ""}`}
                  disabled={!inCycle}
                  onClick={() => onSelectDate(cell)}
                >
                  <span>{Number(cell.slice(8))}</span>
                  {inCycle && !future && score ? <em>{score.pct}%</em> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function toneFor(pct: number, tracked: boolean): string {
  if (!tracked && pct === 0) return "empty";
  if (pct >= 80) return "good";
  if (pct >= 50) return "mid";
  return "low";
}

function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1, 12);
  const pad = (first.getDay() + 6) % 7;
  const last = new Date(year, month + 1, 0, 12).getDate();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return [...Array<string | null>(pad).fill(null), ...eachDate(start, end)];
}
