import { useEffect, useRef, useState } from "react";
import { emptyLog, clockFromStamp, formatDuration, gymDurationMinutes, stampFromDateAndClock, type DayLog } from "../shared/log.ts";
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
  accessorySessionsForDate,
  cardioApplies,
  cycleWeek,
  emptyLoads,
  isBeforeStart,
  isWeekendDay,
  loadForWeek,
  mainSessionsForDate,
  mediaCaption,
  setLoad,
  systemFor,
  weekdaySummary,
  type ExerciseLoad,
  type TrainingExercise,
  type TrainingLoads,
  type TrainingSession,
} from "../shared/training.ts";
import { loadDay, saveDay, saveLoads } from "./api.ts";
import { RmCalculator } from "./RmCalculator.tsx";
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
  const [tab, setTab] = useState<"hoy" | "guia" | "rm">("hoy");
  const [followNow, setFollowNow] = useState(true);
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [log, setLog] = useState<DayLog>(() => emptyLog(todayIso));
  const [loads, setLoads] = useState<TrainingLoads>(() => emptyLoads());
  const [accessoryCounts, setAccessoryCounts] = useState<Record<string, number>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadsRef = useRef(loads);
  loadsRef.current = loads;
  const selectedDate = followNow ? todayIso : pickedDate;
  const jsDay = weekdayFromISO(selectedDate);
  const week = cycleWeek(selectedDate, training.startedOn, training.weekCount);
  const beforeStart = isBeforeStart(selectedDate, training.startedOn);
  const mains = mainSessionsForDate(training, selectedDate);
  const accessoriesToday = accessorySessionsForDate(training, selectedDate);
  const accessories = accessorySessions(training);
  const weekend = isWeekendDay(selectedDate);
  const showCardio = cardioApplies(training, selectedDate) || weekend;
  const durationMinutes = gymDurationMinutes(log.gymStartedAt, log.gymEndedAt);
  const durationLabel = durationMinutes ? formatDuration(durationMinutes) : "";

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

  function toggleExercise(id: string, session?: TrainingSession) {
    const doneExerciseIds = log.doneExerciseIds.includes(id)
      ? log.doneExerciseIds.filter((item) => item !== id)
      : [...log.doneExerciseIds, id];
    let doneSessionIds = log.doneSessionIds;
    if (session?.weeklyGoal) {
      const anyDone = session.exercises.some((item) =>
        item.id === id ? !log.doneExerciseIds.includes(id) : doneExerciseIds.includes(item.id),
      );
      doneSessionIds = anyDone
        ? doneSessionIds.includes(session.id)
          ? doneSessionIds
          : [...doneSessionIds, session.id]
        : doneSessionIds.filter((item) => item !== session.id);
    }
    patchLog({ ...log, doneExerciseIds, doneSessionIds });
  }

  function toggleSession(id: string) {
    const doneSessionIds = log.doneSessionIds.includes(id)
      ? log.doneSessionIds.filter((item) => item !== id)
      : [...log.doneSessionIds, id];
    patchLog({ ...log, doneSessionIds });
  }

  function patchLoad(exerciseId: string, value: ExerciseLoad) {
    commitLoad(exerciseId, value, false);
  }

  function saveLoadNow(exerciseId: string, value: ExerciseLoad) {
    commitLoad(exerciseId, value, true);
  }

  function commitLoad(exerciseId: string, value: ExerciseLoad, immediate: boolean) {
    const next = setLoad(loadsRef.current, exerciseId, week, value, training.weekCount);
    loadsRef.current = next;
    setLoads(next);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    if (immediate) {
      void saveLoads(next);
      return;
    }
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

      <nav className="dock dock-3" aria-label="Vistas">
        <button type="button" className={tab === "hoy" ? "is-active" : ""} onClick={() => goToDate(todayIso)}>
          Hoy
        </button>
        <button type="button" className={tab === "guia" ? "is-active" : ""} onClick={() => setTab("guia")}>
          Guía
        </button>
        <button type="button" className={tab === "rm" ? "is-active" : ""} onClick={() => setTab("rm")}>
          RM
        </button>
      </nav>

      {tab === "guia" ? <Guide training={training} /> : null}
      {tab === "rm" ? <RmCalculator /> : null}
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
            Semana {week} de {training.weekCount} · empieza el {formatDayLong(training.startedOn)}
          </p>

          {beforeStart ? (
            <p className="now-banner is-before">
              El entrenamiento empieza el {formatDayLong(training.startedOn)}. Mientras tanto puedes
              revisar la guía y dejar listos los pesos.
            </p>
          ) : null}

          <p className="now-banner is-before">
            Meta de sesión: 1:30 hrs a 2:00 hrs. Las primeras semanas puedes tardar un poco más
            mientras aprendes los ejercicios.
            {durationLabel ? ` Hoy duraste ${durationLabel}.` : ""}
          </p>

          <section className="habit gym-clock">
            <div className="habit-head">
              <h2>Inicio</h2>
              <button
                type="button"
                className={`check ${log.gymStartedAt ? "is-on" : ""}`}
                onClick={() => patchLog({ ...log, gymStartedAt: new Date().toISOString() })}
              >
                {log.gymStartedAt ? "Actualizar ahora" : "Empezar ahora"}
              </button>
            </div>
            <label>
              Hora en que inicié
              <input
                type="time"
                value={clockFromStamp(log.gymStartedAt)}
                onChange={(event) =>
                  patchLog({
                    ...log,
                    gymStartedAt: stampFromDateAndClock(selectedDate, event.target.value),
                  })
                }
              />
            </label>
          </section>

          {mains.length === 0 && !beforeStart ? (
            weekend ? (
              <section className="goal-card">
                <h2>Fin de semana · descanso</h2>
                <p>Lunes a viernes son los días fuertes. Si no vienes, perfecto.</p>
                <p>Si te decides ir, ve suave:</p>
                <ul className="recs">
                  <li>Cardio fácil 25–30 min (caminadora con inclinación o elíptica, ritmo de conversación).</li>
                  <li>Si te faltó abdomen o antebrazo en la semana, recupera ese bloque aquí y ya.</li>
                  <li>Si ya vas 2/2, quédate en cardio o una caminata. Cero sentadilla, peso muerto ni presses pesados.</li>
                  <li>El domingo, si también vas, aún más ligero: caminata o movilidad. No hagas dos días extra de gym duro.</li>
                </ul>
              </section>
            ) : (
              <section className="goal-card">
                <h2>Descanso de pesas</h2>
                <p>Hoy no hay día de fuerza ni hipertrofia. El cardio es opcional.</p>
              </section>
            )
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
              onSaveNote={saveLoadNow}
            />
          ))}

          {showCardio ? (
            <section className={`habit ${log.cardioDone ? "is-complete" : ""}`}>
              <div className="habit-head">
                <h2>{weekend ? "Cardio fácil si vienes" : "Cardio opcional"}</h2>
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

          {accessoriesToday.map((session) => {
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
                  2 veces por semana ({weekdaySummary(session.weekdays)}). Hoy sí toca. Completa el
                  bloque y marca el día.
                </p>
                {session.exercises.map((exercise) => (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    week={week}
                    weekCount={training.weekCount}
                    done={log.doneExerciseIds.includes(exercise.id)}
                    load={loadForWeek(loads, exercise.id, week)}
                    system={systemFor(training, exercise.systemId)}
                    onToggle={() => toggleExercise(exercise.id, session)}
                    onLoad={(value) => patchLoad(exercise.id, value)}
                    onSaveNote={(value) => saveLoadNow(exercise.id, value)}
                  />
                ))}
                <button
                  type="button"
                  className={`check-line ${today ? "is-on" : ""}`}
                  onClick={() => toggleSession(session.id)}
                >
                  {today ? "Hoy ya lo hice" : "Marcar bloque de hoy"}
                </button>
              </section>
            );
          })}
          {accessories
            .filter((session) => !accessoriesToday.some((item) => item.id === session.id))
            .map((session) => {
              const weekDone = accessoryCounts[session.id] ?? 0;
              const goal = session.weeklyGoal ?? 2;
              const behind = weekDone < goal;
              const today = log.doneSessionIds.includes(session.id);
              if (weekend && behind) {
                return (
                  <section key={session.id} className={`habit ${today ? "is-complete" : ""}`}>
                    <div className="habit-head">
                      <h2>{session.label}</h2>
                      <strong>
                        {weekDone}/{goal} sem.
                      </strong>
                    </div>
                    <p>
                      Te falta en la semana. Si viniste el fin, recupéralo aquí. No es un día fuerte.
                    </p>
                    {session.exercises.map((exercise) => (
                      <ExerciseRow
                        key={exercise.id}
                        exercise={exercise}
                        week={week}
                        weekCount={training.weekCount}
                        done={log.doneExerciseIds.includes(exercise.id)}
                        load={loadForWeek(loads, exercise.id, week)}
                        system={systemFor(training, exercise.systemId)}
                        onToggle={() => toggleExercise(exercise.id, session)}
                        onLoad={(value) => patchLoad(exercise.id, value)}
                        onSaveNote={(value) => saveLoadNow(exercise.id, value)}
                      />
                    ))}
                    <button
                      type="button"
                      className={`check-line ${today ? "is-on" : ""}`}
                      onClick={() => toggleSession(session.id)}
                    >
                      {today ? "Hoy ya lo hice" : "Marcar bloque de hoy"}
                    </button>
                  </section>
                );
              }
              return (
                <section key={session.id} className="habit accessory-offday">
                  <div className="habit-head">
                    <h2>{session.label}</h2>
                    <strong>
                      {weekDone}/{goal} sem.
                    </strong>
                  </div>
                  <p>
                    {goal} veces por semana, {weekdaySummary(session.weekdays)}. Hoy no toca
                    {behind ? "" : " · ya cumpliste la semana"}.
                  </p>
                </section>
              );
            })}

          <section className="habit gym-clock">
            <div className="habit-head">
              <h2>Término</h2>
              <button
                type="button"
                className={`check ${log.gymEndedAt ? "is-on" : ""}`}
                onClick={() => patchLog({ ...log, gymEndedAt: new Date().toISOString() })}
              >
                {log.gymEndedAt ? "Actualizar ahora" : "Terminar ahora"}
              </button>
            </div>
            <label>
              Hora en que terminé
              <input
                type="time"
                value={clockFromStamp(log.gymEndedAt)}
                onChange={(event) =>
                  patchLog({
                    ...log,
                    gymEndedAt: stampFromDateAndClock(selectedDate, event.target.value),
                  })
                }
              />
            </label>
            {durationLabel ? (
              <p className="meta">
                Duración: {durationLabel}
                {durationMinutes && durationMinutes > 120
                  ? " · te pasaste de 2 h"
                  : durationMinutes && durationMinutes < 90
                    ? " · más corto que la meta de 1:30"
                    : " · dentro de la meta"}
                .
              </p>
            ) : (
              <p className="meta">Marca inicio y término para guardar el tiempo de la sesión.</p>
            )}
          </section>
        </>
      ) : null}
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
  onSaveNote,
}: {
  session: TrainingSession;
  week: number;
  weekCount: number;
  log: DayLog;
  loads: TrainingLoads;
  training: Plan["training"];
  onToggle: (id: string) => void;
  onLoad: (id: string, value: ExerciseLoad) => void;
  onSaveNote: (id: string, value: ExerciseLoad) => void;
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
          system={systemFor(training, exercise.systemId)}
          onToggle={() => onToggle(exercise.id)}
          onLoad={(value) => onLoad(exercise.id, value)}
          onSaveNote={(value) => onSaveNote(exercise.id, value)}
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
  system,
  onToggle,
  onLoad,
  onSaveNote,
}: {
  exercise: TrainingExercise;
  week: number;
  weekCount: number;
  done: boolean;
  load: ExerciseLoad;
  system?: ReturnType<typeof systemFor>;
  onToggle: () => void;
  onLoad: (value: ExerciseLoad) => void;
  onSaveNote: (value: ExerciseLoad) => void;
}) {
  const [open, setOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(load.note));
  const [noteDraft, setNoteDraft] = useState(load.note);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setNoteDraft(load.note);
    if (load.note) setNoteOpen(true);
  }, [exercise.id, week, load.note]);

  return (
    <article className={`exercise ${done ? "is-done" : ""}`}>
      <div className="habit-head">
        <h3>{exercise.name}</h3>
        <button type="button" className={`check ${done ? "is-on" : ""}`} aria-pressed={done} onClick={onToggle}>
          {done ? "Hecho" : "Marcar"}
        </button>
      </div>
      <p>{exercise.prescription}</p>
      {exercise.media.length > 0 ? (
        <div className={exercise.media.length > 1 ? "exercise-media-grid" : undefined}>
          {exercise.media.map((src) => (
            <figure key={src} className="exercise-media-item">
              <img className="exercise-media" src={src} alt={mediaCaption(src)} loading="lazy" decoding="async" />
              {exercise.media.length > 1 ? <figcaption>{mediaCaption(src)}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
      {system ? (
        <div className="system-hint">
          <button
            type="button"
            className={`tone-chip ${open ? "is-open" : ""}`}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {system.name}
          </button>
          {open ? <p className="system-body">{system.body}</p> : null}
        </div>
      ) : null}
      <div className="load-row">
        <label>
          Peso semana {week}/{weekCount}
          <input
            value={load.weight}
            inputMode="decimal"
            placeholder="0"
            onChange={(event) => onLoad({ ...load, weight: event.target.value })}
          />
        </label>
        <div className="unit-picks" role="group" aria-label="Unidad">
          <button
            type="button"
            className={load.unit === "kg" ? "is-on" : ""}
            onClick={() => onLoad({ ...load, unit: "kg" })}
          >
            KG
          </button>
          <button
            type="button"
            className={load.unit === "lb" ? "is-on" : ""}
            onClick={() => onLoad({ ...load, unit: "lb" })}
          >
            Libras
          </button>
        </div>
      </div>
      {noteOpen ? (
        <div className="load-note">
          <label>
            Comentario
            <textarea
              rows={2}
              value={noteDraft}
              placeholder="Cómo se sintió, rango, etc."
              onChange={(event) => {
                setNoteDraft(event.target.value);
                setNoteSaved(false);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onSaveNote({ ...load, note: noteDraft.trim() });
              setNoteSaved(true);
              if (!noteDraft.trim()) setNoteOpen(false);
            }}
          >
            {noteSaved ? "Guardado" : "Guardar"}
          </button>
        </div>
      ) : (
        <button type="button" className="ghost load-note-toggle" onClick={() => setNoteOpen(true)}>
          Agregar comentario
        </button>
      )}
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
