import { useEffect, useRef, useState } from "react";
import { emptyLog, type DayLog } from "../shared/log.ts";
import type { Plan } from "../shared/plan.ts";
import {
  WEEK_ORDER,
  dateForWeekday,
  dayName,
  dayShort,
  formatDayLong,
  localDateISO,
  parseISODate,
  weekdayFromISO,
} from "../shared/schedule.ts";
import {
  BLOCK_LABEL,
  accessorySessions,
  cardioApplies,
  cycleWeek,
  emptyLoads,
  isBeforeStart,
  loadForWeek,
  mainSessionsForDate,
  setLoad,
  systemFor,
  type TrainingExercise,
  type TrainingLoads,
  type TrainingSession,
} from "../shared/training.ts";
import { loadDay, saveDay, saveLoads } from "./api.ts";
import { useNow } from "./useNow.ts";

type TrainingViewProps = {
  plan: Plan;
  fromCache: boolean;
  onHome: () => void;
  onEdit: () => void;
  onLogout: () => void;
};

export function TrainingView({ plan, fromCache, onHome, onEdit, onLogout }: TrainingViewProps) {
  const now = useNow();
  const todayIso = localDateISO(now);
  const training = plan.training;
  const [tab, setTab] = useState<"hoy" | "guia">("hoy");
  const [followNow, setFollowNow] = useState(true);
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [log, setLog] = useState<DayLog>(() => emptyLog(todayIso));
  const [loads, setLoads] = useState<TrainingLoads>(() => emptyLoads());
  const [accessoryCounts, setAccessoryCounts] = useState<Record<string, number>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedDate = followNow ? todayIso : pickedDate;
  const jsDay = weekdayFromISO(selectedDate);
  const week = cycleWeek(selectedDate, training.startedOn, training.weekCount);
  const beforeStart = isBeforeStart(selectedDate, training.startedOn);
  const mains = mainSessionsForDate(training, selectedDate);
  const accessories = accessorySessions(training);
  const showCardio = cardioApplies(training, selectedDate);

  function goToDate(next: string) {
    setPickedDate(next);
    setFollowNow(next === todayIso);
    setTab("hoy");
  }

  useEffect(() => {
    let cancelled = false;
    void loadDay(selectedDate).then((result) => {
      if (cancelled) return;
      setLog(result.log);
      setLoads(result.loads);
      setAccessoryCounts(result.accessoryCounts);
    });
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [selectedDate]);

  function patchLog(next: DayLog) {
    setLog(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDay(next).then((result) => {
        setAccessoryCounts(result.accessoryCounts);
      });
    }, 250);
  }

  function toggleExercise(id: string) {
    const doneExerciseIds = log.doneExerciseIds.includes(id)
      ? log.doneExerciseIds.filter((item) => item !== id)
      : [...log.doneExerciseIds, id];
    patchLog({ ...log, doneExerciseIds });
  }

  function toggleSession(id: string) {
    const doneSessionIds = log.doneSessionIds.includes(id)
      ? log.doneSessionIds.filter((item) => item !== id)
      : [...log.doneSessionIds, id];
    patchLog({ ...log, doneSessionIds });
  }

  function patchLoad(exerciseId: string, value: string) {
    const next = setLoad(loads, exerciseId, week, value, training.weekCount);
    setLoads(next);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => {
      void saveLoads(next);
    }, 400);
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Entrenamiento</p>
          <h1>{dayName(jsDay)}</h1>
          <p className="meta">{formatDayLong(selectedDate)}</p>
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

      {fromCache ? (
        <p className="banner">Sin conexión. Mostrando la última versión guardada en este teléfono.</p>
      ) : null}

      <nav className="dock dock-2" aria-label="Vistas">
        <button type="button" className={tab === "hoy" ? "is-active" : ""} onClick={() => goToDate(todayIso)}>
          Hoy
        </button>
        <button type="button" className={tab === "guia" ? "is-active" : ""} onClick={() => setTab("guia")}>
          Guía
        </button>
      </nav>

      {tab === "guia" ? (
        <Guide training={training} />
      ) : (
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
            Semana {week} de {training.weekCount} · empieza el {formatDayLong(training.startedOn)}
          </p>

          {beforeStart ? (
            <p className="now-banner is-before">
              El entrenamiento empieza el {formatDayLong(training.startedOn)}. Mientras tanto puedes
              revisar la guía y dejar listos los pesos.
            </p>
          ) : null}

          {mains.length === 0 && !beforeStart ? (
            <section className="goal-card">
              <h2>Descanso de pesas</h2>
              <p>Hoy no hay día de fuerza ni hipertrofia. Si quieres, arma abdomen, antebrazo o cardio.</p>
            </section>
          ) : null}

          {mains.map((session) => (
            <SessionBlock
              key={session.id}
              session={session}
              week={week}
              weekCount={training.weekCount}
              log={log}
              loads={loads}
              training={training}
              onToggle={toggleExercise}
              onLoad={patchLoad}
            />
          ))}

          {showCardio ? (
            <section className={`habit ${log.cardioDone ? "is-complete" : ""}`}>
              <div className="habit-head">
                <h2>Cardio opcional</h2>
                <button
                  type="button"
                  className={`check ${log.cardioDone ? "is-on" : ""}`}
                  aria-pressed={log.cardioDone}
                  onClick={() => patchLog({ ...log, cardioDone: !log.cardioDone })}
                >
                  {log.cardioDone ? "Hecho" : "Marcar"}
                </button>
              </div>
              <ul className="recs">
                {training.cardioOptions.map((option) => (
                  <li key={option}>{option}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {accessories.map((session) => {
            const weekDone = accessoryCounts[session.id] ?? 0;
            const goal = session.weeklyGoal ?? 2;
            const today = log.doneSessionIds.includes(session.id);
            return (
              <section key={session.id} className={`habit ${today ? "is-complete" : ""}`}>
                <div className="habit-head">
                  <h2>{session.label}</h2>
                  <strong>
                    {weekDone}/{goal} sem.
                  </strong>
                </div>
                <p>
                  {session.focus}. {goal} veces por semana.
                </p>
                <button
                  type="button"
                  className={`check-line ${today ? "is-on" : ""}`}
                  onClick={() => toggleSession(session.id)}
                >
                  {today ? "Hoy ya lo hice" : "Marcar accesorio de hoy"}
                </button>
                {today
                  ? session.exercises.map((exercise) => (
                      <ExerciseRow
                        key={exercise.id}
                        exercise={exercise}
                        week={week}
                        weekCount={training.weekCount}
                        done={log.doneExerciseIds.includes(exercise.id)}
                        load={loadForWeek(loads, exercise.id, week)}
                        hint={systemFor(training, exercise.systemId)?.name}
                        onToggle={() => toggleExercise(exercise.id)}
                        onLoad={(value) => patchLoad(exercise.id, value)}
                      />
                    ))
                  : null}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

function SessionBlock({
  session,
  week,
  weekCount,
  log,
  loads,
  training,
  onToggle,
  onLoad,
}: {
  session: TrainingSession;
  week: number;
  weekCount: number;
  log: DayLog;
  loads: TrainingLoads;
  training: Plan["training"];
  onToggle: (id: string) => void;
  onLoad: (id: string, value: string) => void;
}) {
  const done = session.exercises.filter((item) => log.doneExerciseIds.includes(item.id)).length;
  return (
    <section className="panel gym-session">
      <p className="eyebrow">{BLOCK_LABEL[session.block]}</p>
      <h2>
        {session.label} · {session.focus}
      </h2>
      <p className="meta">
        {done}/{session.exercises.length} ejercicios
      </p>
      {session.exercises.map((exercise) => (
        <ExerciseRow
          key={exercise.id}
          exercise={exercise}
          week={week}
          weekCount={weekCount}
          done={log.doneExerciseIds.includes(exercise.id)}
          load={loadForWeek(loads, exercise.id, week)}
          hint={systemFor(training, exercise.systemId)?.name}
          onToggle={() => onToggle(exercise.id)}
          onLoad={(value) => onLoad(exercise.id, value)}
        />
      ))}
    </section>
  );
}

function ExerciseRow({
  exercise,
  week,
  weekCount,
  done,
  load,
  hint,
  onToggle,
  onLoad,
}: {
  exercise: TrainingExercise;
  week: number;
  weekCount: number;
  done: boolean;
  load: string;
  hint?: string;
  onToggle: () => void;
  onLoad: (value: string) => void;
}) {
  return (
    <article className={`exercise ${done ? "is-done" : ""}`}>
      <div className="habit-head">
        <h3>{exercise.name}</h3>
        <button type="button" className={`check ${done ? "is-on" : ""}`} aria-pressed={done} onClick={onToggle}>
          {done ? "Hecho" : "Marcar"}
        </button>
      </div>
      <p>{exercise.prescription}</p>
      {hint ? <p className="tone-chip">{hint}</p> : null}
      <label>
        Peso semana {week}/{weekCount}
        <input
          value={load}
          inputMode="decimal"
          placeholder="kg o comentario"
          onChange={(event) => onLoad(event.target.value)}
        />
      </label>
    </article>
  );
}

function Guide({ training }: { training: Plan["training"] }) {
  return (
    <>
      <section className="panel">
        <h2>Cómo leer la rutina</h2>
        <ul className="recs">
          {training.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      {training.systems.map((item) => (
        <section key={item.id} className="goal-card">
          <h2>{item.name}</h2>
          {item.example ? <p className="meta">{item.example}</p> : null}
          <p>{item.body}</p>
        </section>
      ))}
      {training.rmNotes.map((item) => (
        <section key={item.id} className="habit">
          <h2>{item.title}</h2>
          <p>{item.body}</p>
        </section>
      ))}
    </>
  );
}
