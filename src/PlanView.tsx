import { useEffect, useMemo, useRef, useState } from "react";
import {
  FREE_MEAL_WEEK_GOAL,
  GREEN_MEAL_GOAL,
  WATER_GOAL_HALVES,
  ZERO_CAL_WEEK_GOAL,
  emptyBreak,
  emptyLog,
  liters,
  type DayLog,
} from "../shared/log.ts";
import type { Meal, MealTone, Plan, ScheduleSlot } from "../shared/plan.ts";
import { greenMealsForDay } from "../shared/progress.ts";
import {
  WEEK_ORDER,
  dateForWeekday,
  dayName,
  dayShort,
  formatDayLong,
  formatNowLong,
  formatTime12,
  localDateISO,
  nowMessage,
  nowStatus,
  parseISODate,
  sortSlots,
  variationIndex,
  weekdayFromISO,
} from "../shared/schedule.ts";
import { AuthError, loadDay, registerDraftFlush, saveDay } from "./api.ts";
import { Calendar } from "./Calendar.tsx";
import { Coach } from "./Coach.tsx";
import { Pantry } from "./Pantry.tsx";
import { SyncBanner } from "./SyncBanner.tsx";
import { useNow } from "./useNow.ts";

const TONE_LABEL: Record<MealTone, string> = {
  green: "Verde",
  amber: "Ámbar",
  red: "Rojo",
  muted: "Neutro",
};

type PlanViewProps = {
  plan: Plan;
  fromCache: boolean;
  pending: boolean;
  onHome: () => void;
  onEdit: () => void;
  onLogout: () => void;
  onAuthLost: () => void;
};

export function PlanView({ plan, fromCache, pending, onHome, onEdit, onLogout, onAuthLost }: PlanViewProps) {
  const now = useNow();
  const todayIso = localDateISO(now);
  const [tab, setTab] = useState<"hoy" | "despensa" | "ia" | "progreso">("hoy");
  const [followNow, setFollowNow] = useState(true);
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [showNotes, setShowNotes] = useState(false);
  const [log, setLog] = useState<DayLog>(() => emptyLog(todayIso));
  const [loadedDate, setLoadedDate] = useState("");
  const [weekZeroCal, setWeekZeroCal] = useState(0);
  const [weekFreeMeals, setWeekFreeMeals] = useState(0);
  const [weekDietBreaks, setWeekDietBreaks] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef(log);
  logRef.current = log;
  const loadGen = useRef(0);
  const selectedDate = followNow ? todayIso : pickedDate;
  const jsDay = weekdayFromISO(selectedDate);
  const date = selectedDate;
  const isToday = selectedDate === todayIso;
  const optionCount = Math.max(
    ...plan.meals.map((meal) => meal.options.length),
    1,
  );
  const variation = variationIndex(jsDay, optionCount) + 1;
  const slots = sortSlots(plan.schedule);
  const status = nowStatus(slots, now);
  const currentId = isToday ? status.currentId : null;
  const greenToday = useMemo(() => greenMealsForDay(plan, jsDay), [plan, jsDay]);

  function goToDate(next: string) {
    setPickedDate(next);
    setFollowNow(next === todayIso);
    setTab("hoy");
  }

  useEffect(() => {
    let cancelled = false;
    const gen = ++loadGen.current;
    setLoadedDate("");
    void loadDay(date)
      .then((result) => {
        if (cancelled || gen !== loadGen.current) return;
        setLog(result.log);
        setLoadedDate(date);
        setWeekZeroCal(result.weekZeroCal);
        setWeekFreeMeals(result.weekFreeMeals);
        setWeekDietBreaks(result.weekDietBreaks);
      })
      .catch((err: unknown) => {
        if (err instanceof AuthError) onAuthLost();
      });
    return () => {
      cancelled = true;
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      persist(logRef.current);
    };
  }, [date]);

  const dayReady = loadedDate === date;
  const view = dayReady ? log : emptyLog(date);
  const greenDone = greenToday.filter((item) => view.doneSlotIds.includes(item.slotId)).length;

  useEffect(() => {
    function flushDraft() {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      persist(logRef.current);
    }
    window.addEventListener("ancla-flush-drafts", flushDraft);
    const stop = registerDraftFlush(flushDraft);
    return () => {
      window.removeEventListener("ancla-flush-drafts", flushDraft);
      stop();
    };
  }, []);

  function applyWeek(result: { weekZeroCal: number; weekFreeMeals: number; weekDietBreaks: number }) {
    setWeekZeroCal(result.weekZeroCal);
    setWeekFreeMeals(result.weekFreeMeals);
    setWeekDietBreaks(result.weekDietBreaks);
  }

  function persist(next: DayLog) {
    if (next.date !== date && loadedDate !== next.date) return;
    void saveDay(next)
      .then(applyWeek)
      .catch((err: unknown) => {
        if (err instanceof AuthError) onAuthLost();
      });
  }

  function patchLog(next: DayLog, debounce = false) {
    if (next.date !== date || loadedDate !== date) return;
    loadGen.current += 1;
    setLog(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (debounce) {
      saveTimer.current = setTimeout(() => persist(next), 400);
      return;
    }
    persist(next);
  }

  function toggleSlot(id: string) {
    const current = logRef.current;
    if (current.date !== date || loadedDate !== date) return;
    const doneSlotIds = current.doneSlotIds.includes(id)
      ? current.doneSlotIds.filter((item) => item !== id)
      : [...current.doneSlotIds, id];
    patchLog({ ...current, doneSlotIds });
  }

  useEffect(() => {
    if (!currentId || tab !== "hoy") return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    document.getElementById(`slot-${currentId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [currentId, tab]);

  return (
    <main className="page" aria-busy={dayReady ? undefined : true}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{isToday ? "Ahora mismo" : "Menú del día"}</p>
          <h1>{dayName(jsDay)}</h1>
          <p className="meta">{isToday ? formatNowLong(now) : formatDayLong(selectedDate)}</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost" onClick={onHome}>
            Inicio
          </button>
          <button type="button" className="ghost" onClick={onEdit}>
            Editar
          </button>
          <button type="button" className="ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <SyncBanner fromCache={fromCache} pending={pending} />

      <nav className="dock" aria-label="Vistas">
        <button type="button" className={tab === "hoy" ? "is-active" : ""} onClick={() => setTab("hoy")}>
          Hoy
        </button>
        <button
          type="button"
          className={tab === "despensa" ? "is-active" : ""}
          onClick={() => setTab("despensa")}
        >
          Despensa
        </button>
        <button type="button" className={tab === "ia" ? "is-active" : ""} onClick={() => setTab("ia")}>
          IA
        </button>
        <button
          type="button"
          className={tab === "progreso" ? "is-active" : ""}
          onClick={() => setTab("progreso")}
        >
          Progreso
        </button>
      </nav>

      {tab === "despensa" ? <Pantry plan={plan} todayIso={todayIso} onAuthLost={onAuthLost} /> : null}

      {tab === "ia" ? <Coach date={selectedDate} onAuthLost={onAuthLost} /> : null}

      {tab === "progreso" ? (
        <Calendar
          plan={plan}
          selectedDate={selectedDate}
          todayIso={todayIso}
          onSelectDate={goToDate}
          onAuthLost={onAuthLost}
        />
      ) : null}

      {tab === "hoy" ? (
        <>
      <nav className="week" aria-label="Día de la semana">
        {WEEK_ORDER.map((day) => {
          const iso = dateForWeekday(day, parseISODate(selectedDate));
          return (
          <button
            key={day}
            type="button"
            className={iso === selectedDate ? "is-active" : ""}
            aria-current={iso === todayIso ? "date" : undefined}
            onClick={() => goToDate(iso)}
          >
            <span>{dayShort(day)}</span>
            {iso === todayIso ? <em>hoy</em> : null}
          </button>
          );
        })}
      </nav>

      <p className="meta">
        Variación {variation} de {optionCount}
      </p>

      {isToday ? (
        <p className={`now-banner is-${status.phase}`}>{nowMessage(status)}</p>
      ) : (
        <button type="button" className="now-banner ghost-banner" onClick={() => goToDate(todayIso)}>
          Estás viendo otro día. Volver a ahora ({formatNowLong(now)})
        </button>
      )}

      <section className={`habit ${greenDone >= GREEN_MEAL_GOAL ? "is-complete" : ""}`}>
        <div className="habit-head">
          <h2>Comidas verdes</h2>
          <strong>
            {greenDone}/{GREEN_MEAL_GOAL}
          </strong>
        </div>
        <p>
          Hoy cuentan: {greenToday.map((item) => item.title).join(", ") || "ninguna en esta variación"}.
        </p>
      </section>

      <ol className="timeline">
        {slots.map((slot) => (
          <li key={slot.id}>
            <SlotCard
              slot={slot}
              plan={plan}
              jsDay={jsDay}
              current={slot.id === currentId}
              done={view.doneSlotIds.includes(slot.id)}
              onToggle={() => toggleSlot(slot.id)}
            />
          </li>
        ))}
      </ol>

      <section className={`habit ${log.waterHalves >= WATER_GOAL_HALVES ? "is-complete" : ""}`}>
        <div className="habit-head">
          <h2>Agua</h2>
          <strong>
            {liters(log.waterHalves)} / 3.5 L
          </strong>
        </div>
        <div className="pips" role="group" aria-label="Agua del día">
          {Array.from({ length: WATER_GOAL_HALVES }, (_, index) => {
            const value = index + 1;
            return (
              <button
                key={value}
                type="button"
                className={log.waterHalves >= value ? "is-on" : ""}
                aria-label={`${liters(value)} litros`}
                onClick={() =>
                  patchLog({
                    ...log,
                    waterHalves: log.waterHalves === value ? value - 1 : value,
                  })
                }
              >
                {value === WATER_GOAL_HALVES ? "3.5" : ""}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`check-line ${log.waterHalves >= WATER_GOAL_HALVES ? "is-on" : ""}`}
          onClick={() =>
            patchLog({
              ...log,
              waterHalves: log.waterHalves >= WATER_GOAL_HALVES ? 0 : WATER_GOAL_HALVES,
            })
          }
        >
          {log.waterHalves >= WATER_GOAL_HALVES ? "Listo: 3.5 L" : "Marcar 3.5 L"}
        </button>
        <div className="extra-water">
          <span>Agua extra {liters(log.extraWaterHalves)} L</span>
          <div>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                patchLog({ ...log, extraWaterHalves: Math.max(0, log.extraWaterHalves - 1) })
              }
            >
              −
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => patchLog({ ...log, extraWaterHalves: log.extraWaterHalves + 1 })}
            >
              + 0.5 L
            </button>
          </div>
        </div>
      </section>

      <section className={`habit ${log.zeroCalDrink ? "is-complete" : ""}`}>
        <div className="habit-head">
          <h2>Bebida cero</h2>
          <strong>
            {weekZeroCal}/{ZERO_CAL_WEEK_GOAL} sem.
          </strong>
        </div>
        <p>Clight Zero, Be Light, Coca-Cola sin azúcar, etc. Máximo 4 veces por semana.</p>
        <button
          type="button"
          className={`check-line ${log.zeroCalDrink ? "is-on" : ""}`}
          onClick={() => patchLog({ ...log, zeroCalDrink: !log.zeroCalDrink })}
        >
          {log.zeroCalDrink ? "Hoy sí la tomé" : "Marcar bebida de hoy"}
        </button>
      </section>

      <section className={`habit ${log.freeMeal ? "is-complete" : ""}`}>
        <div className="habit-head">
          <h2>Comida libre</h2>
          <strong>
            {weekFreeMeals}/{FREE_MEAL_WEEK_GOAL} sem.
          </strong>
        </div>
        <p>3 a la semana. El resto de comidas siguen el plan.</p>
        <button
          type="button"
          className={`check-line ${log.freeMeal ? "is-on" : ""}`}
          onClick={() => patchLog({ ...log, freeMeal: !log.freeMeal })}
        >
          {log.freeMeal ? "Hoy usé una libre" : "Marcar comida libre de hoy"}
        </button>
        {log.freeMeal ? (
          <label>
            Qué comiste
            <textarea
              rows={2}
              value={log.freeMealNote}
              placeholder="Tacos, pizza, antojo de la oficina…"
              onChange={(event) => patchLog({ ...log, freeMealNote: event.target.value }, true)}
            />
          </label>
        ) : null}
      </section>

      <section className={`habit ${log.dietBreaks.length > 0 ? "is-alert" : ""}`}>
        <div className="habit-head">
          <h2>¿Rompiste la dieta?</h2>
          <strong>
            {weekDietBreaks} sem.
          </strong>
        </div>
        <p>Anota qué fue, para el historial. Si pasó más de una vez, suma otra con +.</p>
        {log.dietBreaks.map((item, index) => (
          <label key={item.id}>
            {log.dietBreaks.length > 1 ? `Qué comiste · ${index + 1}` : "Qué comiste"}
            <textarea
              rows={2}
              value={item.text}
              placeholder="Galletas, refresco, algo fuera del plan…"
              onChange={(event) => {
                const dietBreaks = log.dietBreaks.map((row) =>
                  row.id === item.id ? { ...row, text: event.target.value } : row,
                );
                patchLog({ ...log, dietBreaks }, true);
              }}
            />
          </label>
        ))}
        <div className="extra-water">
          <span>
            {log.dietBreaks.length === 0
              ? "Hoy no se ha marcado"
              : log.dietBreaks.length === 1
                ? "1 vez hoy"
                : `${log.dietBreaks.length} veces hoy`}
          </span>
          <div>
            <button
              type="button"
              className="ghost"
              disabled={log.dietBreaks.length === 0}
              onClick={() => patchLog({ ...log, dietBreaks: log.dietBreaks.slice(0, -1) })}
            >
              −
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => patchLog({ ...log, dietBreaks: [...log.dietBreaks, emptyBreak()] })}
            >
              +
            </button>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="ghost notes-toggle"
        onClick={() => setShowNotes((open) => !open)}
      >
        {showNotes ? "Ocultar recomendaciones" : "Ver recomendaciones y cardio"}
      </button>

      {showNotes ? (
        <>
          {plan.goals.map((goal) => (
            <section key={goal.id} className="goal-card">
              <h2>{goal.title}</h2>
              <p>{goal.body}</p>
            </section>
          ))}

          <section className="panel">
            <h2>Recomendaciones</h2>
            <ul className="recs">
              {plan.recommendations.map((item) => (
                <li key={item.id} data-highlight={item.highlight ?? "none"}>
                  {item.text}
                </li>
              ))}
            </ul>
          </section>

          {plan.cardio ? (
            <section className="cardio">
              <p>{plan.cardio}</p>
            </section>
          ) : null}

          {plan.extras.map((extra) => (
            <p key={extra} className="extra">
              {extra}
            </p>
          ))}
        </>
      ) : null}
        </>
      ) : null}
    </main>
  );
}

function SlotCard({
  slot,
  plan,
  jsDay,
  current,
  done,
  onToggle,
}: {
  slot: ScheduleSlot;
  plan: Plan;
  jsDay: number;
  current: boolean;
  done: boolean;
  onToggle: () => void;
}) {
  const meal = slot.mealId ? plan.meals.find((item) => item.id === slot.mealId) : undefined;

  if (slot.kind === "supplement" || !meal) {
    return (
      <section
        id={`slot-${slot.id}`}
        className="meal supplement"
        data-current={current ? "true" : undefined}
        data-done={done ? "true" : undefined}
      >
        <div className="meal-head">
          <time dateTime={slot.time}>{formatTime12(slot.time)}</time>
          <CheckButton done={done} onToggle={onToggle} />
        </div>
        <h2>{slot.title}</h2>
        {slot.detail ? <p>{slot.detail}</p> : null}
        {current ? <p className="now">Ahora</p> : null}
      </section>
    );
  }

  return (
    <MealCard
      meal={meal}
      slot={slot}
      jsDay={jsDay}
      current={current}
      done={done}
      onToggle={onToggle}
    />
  );
}

function MealCard({
  meal,
  slot,
  jsDay,
  current,
  done,
  onToggle,
}: {
  meal: Meal;
  slot: ScheduleSlot;
  jsDay: number;
  current: boolean;
  done: boolean;
  onToggle: () => void;
}) {
  const option = meal.options[variationIndex(jsDay, meal.options.length)];
  if (!option) return null;

  const rotating = meal.options.length > 1;

  return (
    <section
      id={`slot-${slot.id}`}
      className="meal"
      data-tone={option.tone}
      data-current={current ? "true" : undefined}
      data-done={done ? "true" : undefined}
    >
      <div className="meal-head">
        <time dateTime={slot.time}>{formatTime12(slot.time)}</time>
        <CheckButton done={done} onToggle={onToggle} />
      </div>
      <h2>{meal.name}</h2>
      <h3>{option.title}</h3>
      {rotating ? (
        <p className="tone-chip" data-tone={option.tone}>
          {TONE_LABEL[option.tone]} · opción {variationIndex(jsDay, meal.options.length) + 1}
          {meal.kcal != null ? ` · ${meal.kcal} kcal` : ""}
        </p>
      ) : (
        <p className="tone-chip" data-tone={option.tone}>
          Todos los días{meal.kcal != null ? ` · ${meal.kcal} kcal` : ""}
        </p>
      )}
      {slot.detail ? <p className="slot-detail">{slot.detail}</p> : null}
      <ul>
        {option.items.filter(Boolean).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function CheckButton({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`check ${done ? "is-on" : ""}`}
      aria-pressed={done}
      onClick={onToggle}
    >
      {done ? "Hecho" : "Marcar"}
    </button>
  );
}
