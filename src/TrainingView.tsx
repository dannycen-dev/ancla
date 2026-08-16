import { useEffect, useRef, useState } from "react";
import { emptyLog, clockFromStamp, formatDuration, gymDurationMinutes, normalizeClock, stampEndFromDateAndClock, stampFromDateAndClock, type DayLog } from "../shared/log.ts";
import type { Plan } from "../shared/plan.ts";
import {
  WEEK_ORDER,
  dateForWeekday,
  dayName,
  dayShort,
  formatDayLong,
  parseISODate,
  TRAINING_WEEK_CUTOVER_HOUR,
  trainingDateISO,
  weekdayFromISO,
} from "../shared/schedule.ts";
import { rmKgForExercise, weekDataCounts, weekLiftStats } from "../shared/stats.ts";
import {
  BLOCK_LABEL,
  accessorySessions,
  accessorySessionsForDate,
  addRmEntry,
  cardioApplies,
  cycleWeek,
  emptyLoads,
  isBeforeStart,
  isWeekendDay,
  loadForWeek,
  mainSessionsForDate,
  mediaCaption,
  parseSetSlots,
  setsForSlots,
  setLoad,
  systemFor,
  weekdaySummary,
  type ExerciseLoad,
  type RmEntry,
  type TrainingExercise,
  type TrainingLoads,
  type TrainingSession,
} from "../shared/training.ts";
import { parseWeight } from "../shared/rm.ts";
import { coachSets } from "../shared/setCoach.ts";
import { AuthError, loadDay, registerDraftFlush, saveDay, saveLoads } from "./api.ts";
import { RmCalculator } from "./RmCalculator.tsx";
import { SetTimer } from "./SetTimer.tsx";
import { SyncBanner } from "./SyncBanner.tsx";
import { useNow } from "./useNow.ts";

type TrainingViewProps = {
  plan: Plan;
  fromCache: boolean;
  pending: boolean;
  onHome: () => void;
  onEdit: () => void;
  onLogout: () => void;
  onAuthLost: () => void;
};

export function TrainingView({ plan, fromCache, pending, onHome, onEdit, onLogout, onAuthLost }: TrainingViewProps) {
  const now = useNow();
  const todayIso = trainingDateISO(now);
  const training = plan.training;
  const [tab, setTab] = useState<"hoy" | "guia" | "rm">("hoy");
  const [followNow, setFollowNow] = useState(true);
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [log, setLog] = useState<DayLog>(() => emptyLog(todayIso));
  const [loadedDate, setLoadedDate] = useState("");
  const [loads, setLoads] = useState<TrainingLoads>(() => emptyLoads());
  const [accessoryCounts, setAccessoryCounts] = useState<Record<string, number>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logGen = useRef(0);
  const loadGen = useRef(0);
  const loadsRef = useRef(loads);
  loadsRef.current = loads;
  const logRef = useRef(log);
  logRef.current = log;
  const selectedDate = followNow ? todayIso : pickedDate;
  const dayReady = loadedDate === selectedDate;
  const view = dayReady ? log : emptyLog(selectedDate);
  const jsDay = weekdayFromISO(selectedDate);
  const week = cycleWeek(selectedDate, training.startedOn, training.weekCount);
  const beforeStart = isBeforeStart(selectedDate, training.startedOn);
  const mains = mainSessionsForDate(training, selectedDate);
  const accessoriesToday = accessorySessionsForDate(training, selectedDate);
  const accessories = accessorySessions(training);
  const weekend = isWeekendDay(selectedDate);
  const showCardio = cardioApplies(training, selectedDate) || weekend;
  const durationMinutes = gymDurationMinutes(view.gymStartedAt, view.gymEndedAt);
  const durationLabel = durationMinutes ? formatDuration(durationMinutes) : "";

  function goToDate(next: string) {
    setPickedDate(next);
    setFollowNow(next === todayIso);
    setTab("hoy");
  }

  useEffect(() => {
    let cancelled = false;
    const nextLogGen = ++logGen.current;
    const nextLoadGen = ++loadGen.current;
    setLoadedDate("");
    void loadDay(selectedDate)
      .then((result) => {
        if (cancelled) return;
        if (nextLogGen === logGen.current) {
          setLog(result.log);
          setLoadedDate(selectedDate);
          setAccessoryCounts(result.accessoryCounts);
        }
        if (nextLoadGen === loadGen.current) setLoads(result.loads);
      })
      .catch((err: unknown) => {
        if (err instanceof AuthError) onAuthLost();
      });
    return () => {
      cancelled = true;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void saveDay(logRef.current).catch((err: unknown) => {
          if (err instanceof AuthError) onAuthLost();
        });
      }
      if (loadTimer.current) {
        clearTimeout(loadTimer.current);
        loadTimer.current = null;
        persistLoads(loadsRef.current);
      }
    };
  }, [selectedDate]);

  function patchLog(next: DayLog) {
    if (next.date !== selectedDate || loadedDate !== selectedDate) return;
    logGen.current += 1;
    setLog(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDay(next)
        .then((result) => {
          setAccessoryCounts(result.accessoryCounts);
        })
        .catch((err: unknown) => {
          if (err instanceof AuthError) onAuthLost();
        });
    }, 250);
  }

  function toggleExercise(id: string, session?: TrainingSession) {
    if (logRef.current.date !== selectedDate || loadedDate !== selectedDate) return;
    const current = logRef.current;
    const doneExerciseIds = current.doneExerciseIds.includes(id)
      ? current.doneExerciseIds.filter((item) => item !== id)
      : [...current.doneExerciseIds, id];
    let doneSessionIds = current.doneSessionIds;
    if (session?.weeklyGoal) {
      const anyDone = session.exercises.some((item) =>
        item.id === id ? !current.doneExerciseIds.includes(id) : doneExerciseIds.includes(item.id),
      );
      doneSessionIds = anyDone
        ? doneSessionIds.includes(session.id)
          ? doneSessionIds
          : [...doneSessionIds, session.id]
        : doneSessionIds.filter((item) => item !== session.id);
    }
    patchLog({ ...current, doneExerciseIds, doneSessionIds });
  }

  function toggleSession(id: string) {
    if (logRef.current.date !== selectedDate || loadedDate !== selectedDate) return;
    const current = logRef.current;
    const doneSessionIds = current.doneSessionIds.includes(id)
      ? current.doneSessionIds.filter((item) => item !== id)
      : [...current.doneSessionIds, id];
    patchLog({ ...current, doneSessionIds });
  }

  function patchLoad(exerciseId: string, value: ExerciseLoad) {
    commitLoad(exerciseId, value, false);
  }

  function saveLoadNow(exerciseId: string, value: ExerciseLoad) {
    commitLoad(exerciseId, value, true);
  }

  function persistLoads(next: TrainingLoads) {
    void saveLoads(next).catch((err: unknown) => {
      if (err instanceof AuthError) onAuthLost();
    });
  }

  function commitLoad(exerciseId: string, value: ExerciseLoad, immediate: boolean) {
    const next = setLoad(loadsRef.current, exerciseId, week, value, training.weekCount, selectedDate);
    loadsRef.current = next;
    setLoads(next);
    loadGen.current += 1;
    if (loadTimer.current) clearTimeout(loadTimer.current);
    if (immediate) {
      persistLoads(next);
      return;
    }
    loadTimer.current = setTimeout(() => {
      persistLoads(next);
    }, 400);
  }

  function saveRm(entry: RmEntry) {
    const next = addRmEntry(loadsRef.current, entry);
    loadsRef.current = next;
    setLoads(next);
    loadGen.current += 1;
    persistLoads(next);
  }

  useEffect(() => {
    function flushDraft() {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void saveDay(logRef.current).catch((err: unknown) => {
          if (err instanceof AuthError) onAuthLost();
        });
      }
      if (loadTimer.current) {
        clearTimeout(loadTimer.current);
        loadTimer.current = null;
        persistLoads(loadsRef.current);
      }
    }
    window.addEventListener("ancla-flush-drafts", flushDraft);
    const stop = registerDraftFlush(flushDraft);
    return () => {
      window.removeEventListener("ancla-flush-drafts", flushDraft);
      stop();
    };
  }, []);

  const liftNames = [
    ...new Set(training.sessions.flatMap((session) => session.exercises.map((item) => item.name))),
  ];
  const counts = weekDataCounts(loads, week);
  const priorStats = week > 1 ? weekLiftStats(training, loads, week - 1) : [];

  return (
    <main className="page" aria-busy={dayReady ? undefined : true}>
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

      <SyncBanner fromCache={fromCache} pending={pending} />

      <nav className="dock dock-3" aria-label="Vistas">
        <button type="button" className={tab === "hoy" ? "is-active" : ""} onClick={() => setTab("hoy")}>
          Hoy
        </button>
        <button type="button" className={tab === "guia" ? "is-active" : ""} onClick={() => setTab("guia")}>
          Guía
        </button>
        <button type="button" className={tab === "rm" ? "is-active" : ""} onClick={() => setTab("rm")}>
          RM
        </button>
      </nav>

      <nav className="week" aria-label="Día de la semana">
        {WEEK_ORDER.map((day) => {
          const iso = dateForWeekday(day, parseISODate(selectedDate));
          return (
            <button
              key={day}
              type="button"
              className={iso === selectedDate ? "is-active" : ""}
              aria-pressed={iso === selectedDate}
              aria-current={iso === todayIso ? "date" : undefined}
              onClick={() => goToDate(iso)}
            >
              <span>{dayShort(day)}</span>
              {iso === todayIso ? <em>hoy</em> : null}
            </button>
          );
        })}
      </nav>

      {now.getDay() === 1 && now.getHours() < TRAINING_WEEK_CUTOVER_HOUR ? (
        <p className="now-banner is-before">
          Hasta la 1:00 a.m. esto cuenta como domingo, semana {week}.
        </p>
      ) : null}

      {tab === "guia" ? <Guide training={training} /> : null}
      {tab === "rm" ? (
        <RmCalculator
          week={week}
          date={selectedDate}
          liftNames={liftNames}
          entries={loads.rms ?? []}
          onSave={saveRm}
        />
      ) : null}
      {tab === "hoy" ? (
        <>
          <p className="meta">
            Semana {week} de {training.weekCount} · empieza el {formatDayLong(training.startedOn)} ·
            corte lunes 1:00 a.m.
          </p>

          <WeekStatsBanner week={week} counts={counts} priorStats={priorStats} />

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
                className={`check ${view.gymStartedAt ? "is-on" : ""}`}
                onClick={() => {
                  const stamp =
                    stampFromDateAndClock(selectedDate, clockFromStamp(new Date().toISOString())) ??
                    new Date().toISOString();
                  patchLog({ ...log, gymStartedAt: stamp });
                }}
              >
                {view.gymStartedAt ? "Actualizar ahora" : "Empezar ahora"}
              </button>
            </div>
            <GymTimeField
              label="Hora en que inicié"
              saved={view.gymStartedAt}
              onCommit={(clock) => {
                const stamp = stampFromDateAndClock(selectedDate, clock);
                if (stamp) patchLog({ ...log, gymStartedAt: stamp });
              }}
            />
          </section>

          {mains.length === 0 && !beforeStart ? (
            weekend ? (
              <section className="goal-card">
                <h2>Fin de semana · descanso</h2>
                <p>Lunes a viernes son los días fuertes. Si no vienes, perfecto.</p>
                <p>Si te decides ir, elige una cosa (no las tres):</p>
                <ul className="recs">
                  <li>Cardio fácil 25–30 min (caminadora con inclinación o elíptica, ritmo de conversación).</li>
                  <li>Si te faltó abdomen o antebrazo, recupera ese bloque y ya.</li>
                  <li>
                    Estimar RM: 1 o 2 básicos (press, sentadilla/hack, peso muerto o remo). Sube hasta un
                    set de 5–8 reps duras, anota peso y reps en la pestaña RM. Eso queda en esta
                    semana hasta el lunes 1:00 a.m. No busques el 1RM a muerte.
                  </li>
                  <li>
                    Mejor el domingo si el sábado descansaste. Si ya estimaste RM un día, el otro
                    que sea solo caminata o descanso.
                  </li>
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
              log={view}
              loads={loads}
              training={training}
              onToggle={toggleExercise}
              onLoad={patchLoad}
              onSaveNote={saveLoadNow}
            />
          ))}

          {showCardio ? (
            <section className={`habit ${view.cardioDone ? "is-complete" : ""}`}>
              <div className="habit-head">
                <h2>{weekend ? "Cardio fácil si vienes" : "Cardio opcional"}</h2>
                <button
                  type="button"
                  className={`check ${view.cardioDone ? "is-on" : ""}`}
                  aria-pressed={view.cardioDone}
                  onClick={() => patchLog({ ...log, cardioDone: !log.cardioDone })}
                >
                  {view.cardioDone ? "Hecho" : "Marcar"}
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
            const today = view.doneSessionIds.includes(session.id);
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
                    done={view.doneExerciseIds.includes(exercise.id)}
                    load={loadForWeek(loads, exercise.id, week)}
                    priorSets={week > 1 ? loadForWeek(loads, exercise.id, week - 1).sets : []}
                    knownRm={week > 1 ? rmKgForExercise(loads.rms ?? [], exercise.name, week - 1) : null}
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
              const today = view.doneSessionIds.includes(session.id);
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
                        done={view.doneExerciseIds.includes(exercise.id)}
                        load={loadForWeek(loads, exercise.id, week)}
                        priorSets={week > 1 ? loadForWeek(loads, exercise.id, week - 1).sets : []}
                        knownRm={week > 1 ? rmKgForExercise(loads.rms ?? [], exercise.name, week - 1) : null}
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
                className={`check ${view.gymEndedAt ? "is-on" : ""}`}
                onClick={() => {
                  const stamp =
                    stampEndFromDateAndClock(
                      selectedDate,
                      clockFromStamp(new Date().toISOString()),
                      log.gymStartedAt,
                    ) ?? new Date().toISOString();
                  patchLog({ ...log, gymEndedAt: stamp });
                }}
              >
                {view.gymEndedAt ? "Actualizar ahora" : "Terminar ahora"}
              </button>
            </div>
            <GymTimeField
              label="Hora en que terminé"
              saved={view.gymEndedAt}
              onCommit={(clock) => {
                const stamp = stampEndFromDateAndClock(selectedDate, clock, log.gymStartedAt);
                if (stamp) patchLog({ ...log, gymEndedAt: stamp });
              }}
            />
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

function clocksMatch(left: string, right: string): boolean {
  return (normalizeClock(left) ?? "") === (normalizeClock(right) ?? "");
}

function GymTimeField({
  label,
  saved,
  onCommit,
}: {
  label: string;
  saved: string | null;
  onCommit: (clock: string) => void;
}) {
  const savedClock = clockFromStamp(saved);
  const [draft, setDraft] = useState(savedClock);
  const dirty = !clocksMatch(draft, savedClock);

  useEffect(() => {
    setDraft(clockFromStamp(saved));
  }, [saved]);

  return (
    <label className="gym-time-field">
      {label}
      <input
        type="time"
        step="60"
        autoComplete="off"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {dirty ? (
        <div className="gym-time-actions">
          <button type="button" className="ghost" onClick={() => setDraft(savedClock)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draft) return;
              onCommit(draft);
            }}
          >
            Guardar
          </button>
        </div>
      ) : null}
    </label>
  );
}

function WeekStatsBanner({
  week,
  counts,
  priorStats,
}: {
  week: number;
  counts: { snapshots: number; rms: number };
  priorStats: ReturnType<typeof weekLiftStats>;
}) {
  if (week <= 1) {
    const bits: string[] = [];
    if (counts.snapshots > 0) {
      bits.push(`${counts.snapshots} ejercicio${counts.snapshots === 1 ? "" : "s"} con peso`);
    }
    if (counts.rms > 0) {
      bits.push(`${counts.rms} RM`);
    }
    const saved = bits.length
      ? `Van ${bits.join(" y ")}.`
      : "Los pesos, series y RM se van guardando.";
    return (
      <p className="now-banner is-before">
        {saved} El corte de semana es lunes 1:00 a.m., para que el RM del sábado o domingo (aunque
        lo anotes pasado medianoche) entre en la semana 1.
      </p>
    );
  }

  return (
    <section className="panel week-stats">
      <p className="eyebrow">Stats semana {week - 1}</p>
      <h2>Marcas para esta semana</h2>
      {priorStats.length === 0 ? (
        <p>
          Aún no hay pesos ni RM de la semana {week - 1}. Anota series o usa la pestaña RM; el corte
          sigue siendo lunes 1:00 a.m.
        </p>
      ) : (
        <>
          <p>
            Con esto se sugieren las cargas de la semana {week}. Si el fin de semana estimaste RM,
            ya está metido aquí.
          </p>
          <ul className="week-stats-list">
            {priorStats.map((stat) => (
              <li key={`${stat.exerciseId}-${stat.name}`}>
                <span>
                  <strong>{stat.name}</strong>
                  <em>
                    {stat.topSet}
                    {stat.source ? ` · ${stat.source}` : ""}
                  </em>
                </span>
                <strong>{stat.estimatedRm != null ? `${stat.estimatedRm} kg RM` : "—"}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
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
          priorSets={week > 1 ? loadForWeek(loads, exercise.id, week - 1).sets : []}
          knownRm={week > 1 ? rmKgForExercise(loads.rms ?? [], exercise.name, week - 1) : null}
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
  priorSets,
  knownRm,
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
  priorSets?: ExerciseLoad["sets"];
  knownRm?: number | null;
  system?: ReturnType<typeof systemFor>;
  onToggle: () => void;
  onLoad: (value: ExerciseLoad) => void;
  onSaveNote: (value: ExerciseLoad) => void;
}) {
  const [open, setOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(load.note));
  const [noteDraft, setNoteDraft] = useState(load.note);
  const [noteSaved, setNoteSaved] = useState(false);
  const slots = parseSetSlots(exercise.prescription);
  const sets = setsForSlots(load, slots.length);
  const coach = coachSets({
    prescription: exercise.prescription,
    name: exercise.name,
    systemId: exercise.systemId,
    systemName: system?.name,
    slots,
    sets,
    priorSets,
    knownRm,
    knownRmSource: "RM guardado de la semana pasada",
  });
  const sharedTimer = coach.timers.find((item) => item && (item.mode === "rest" || item.steps));

  useEffect(() => {
    setNoteDraft(load.note);
    if (load.note) setNoteOpen(true);
  }, [exercise.id, week, load.note]);

  function patchSet(index: number, next: Partial<(typeof sets)[number]>) {
    onLoad({
      ...load,
      sets: sets.map((item, i) => (i === index ? { ...item, ...next } : item)),
    });
  }

  function bumpWeight(index: number, delta: number) {
    const current = parseWeight(sets[index].weight) ?? 0;
    const next = Math.max(0, Math.round((current + delta) * 2) / 2);
    patchSet(index, { weight: Number.isInteger(next) ? String(next) : next.toFixed(1) });
  }

  return (
    <article className={`exercise ${done ? "is-done" : ""}`}>
      <div className="habit-head">
        <h3>{exercise.name}</h3>
        <button type="button" className={`check ${done ? "is-on" : ""}`} aria-pressed={done} onClick={onToggle}>
          {done ? "Hecho" : "Marcar"}
        </button>
      </div>
      <p className="meta">
        {exercise.prescription} · semana {week}/{weekCount}
      </p>
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
      <div className={`system-hint ${coach.empty ? "is-empty" : ""}`}>
        <p className="tone-chip">{coach.title}</p>
        <p className="system-body">{coach.prompt}</p>
        {coach.howto.length > 0 ? (
          <ol className="coach-howto">
            {coach.howto.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        ) : null}
        {coach.details.length > 0 ? (
          <ul className="coach-lines">
            {coach.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {sharedTimer ? <SetTimer timer={sharedTimer} /> : null}
        {system?.body ? (
          <>
            <button
              type="button"
              className="ghost coach-more"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Ocultar explicación" : "Cómo se hace"}
            </button>
            {open ? <p className="system-more">{system.body}</p> : null}
          </>
        ) : null}
      </div>
      <div className="set-loads">
        {slots.map((slot, index) => {
          const set = sets[index];
          const suggested = coach.suggested[index];
          const timer = coach.timers[index];
          const showTimer = Boolean(timer && timer.mode === "work" && !timer.steps);
          const isAnchor = coach.empty && index === coach.anchorIndex;
          return (
            <div key={slot.key} className={`set-load ${isAnchor ? "is-anchor" : ""}`}>
              <p>{slot.label}</p>
              {slot.hint ? <p className="set-load-hint">{slot.hint}</p> : null}
              {suggested ? (
                <button
                  type="button"
                  className="ghost load-suggest"
                  onClick={() => patchSet(index, { weight: suggested })}
                >
                  Usar {suggested} {set.unit}
                </button>
              ) : null}
              {showTimer && timer ? <SetTimer timer={timer} /> : null}
              {coach.hideWeight[index] ? null : (
                <>
              <div className="load-row">
                <input
                  value={set.weight}
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={suggested ?? "0"}
                  aria-label={`Peso ${slot.label}`}
                  onChange={(event) => patchSet(index, { weight: event.target.value })}
                />
                <div className="unit-picks" role="group" aria-label={`Unidad ${slot.label}`}>
                  <button
                    type="button"
                    className={set.unit === "kg" ? "is-on" : ""}
                    onClick={() => patchSet(index, { unit: "kg" })}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    className={set.unit === "lb" ? "is-on" : ""}
                    onClick={() => patchSet(index, { unit: "lb" })}
                  >
                    lb
                  </button>
                </div>
              </div>
              <div className="weight-nudge" role="group" aria-label={`Ajuste ${slot.label}`}>
                <button type="button" className="ghost" onClick={() => bumpWeight(index, -2.5)}>
                  −2.5
                </button>
                <button type="button" className="ghost" onClick={() => bumpWeight(index, 2.5)}>
                  +2.5
                </button>
              </div>
                </>
              )}
            </div>
          );
        })}
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
              onBlur={() => {
                onSaveNote({ ...load, note: noteDraft.trim(), sets });
                setNoteSaved(true);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onSaveNote({ ...load, note: noteDraft.trim(), sets });
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
