import type { Plan } from "../shared/plan.ts";
import {
  BLOCK_LABEL,
  WEEKDAY_OPTIONS,
  emptyExercise,
  emptyRmNote,
  emptySession,
  emptySystem,
  type TrainingBlock,
  type TrainingPlan,
  type TrainingSession,
} from "../shared/training.ts";

const BLOCKS: TrainingBlock[] = ["fuerza", "hipertrofia", "accesorio", "cardio"];

type TrainingEditorProps = {
  plan: Plan;
  busy: boolean;
  error: string;
  onChange: (plan: Plan) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function TrainingEditor({ plan, busy, error, onChange, onSave, onCancel }: TrainingEditorProps) {
  const training = plan.training;

  function patch(next: TrainingPlan) {
    onChange({ ...plan, training: next });
  }

  return (
    <main className="page editor">
      <header className="topbar">
        <div>
          <p className="eyebrow">Panel</p>
          <h1>Editar entrenamiento</h1>
        </div>
        <button type="button" className="ghost" onClick={onCancel}>
          Ver
        </button>
      </header>

      <div className="row-2">
        <label>
          Empieza el ciclo
          <input
            type="date"
            value={training.startedOn}
            onChange={(event) => patch({ ...training, startedOn: event.target.value })}
          />
        </label>
        <label>
          Semanas del bloque
          <input
            type="number"
            min={1}
            max={12}
            value={training.weekCount}
            onChange={(event) =>
              patch({ ...training, weekCount: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })
            }
          />
        </label>
      </div>

      <label>
        Notas (una por línea)
        <textarea
          rows={4}
          value={training.notes.join("\n")}
          onChange={(event) => patch({ ...training, notes: event.target.value.split("\n") })}
        />
      </label>

      <h2>Cardio opcional</h2>
      <label>
        Opciones (una por línea)
        <textarea
          rows={3}
          value={training.cardioOptions.join("\n")}
          onChange={(event) => patch({ ...training, cardioOptions: event.target.value.split("\n") })}
        />
      </label>
      <fieldset className="block">
        <legend>Días sugeridos</legend>
        <div className="weekday-picks">
          {WEEKDAY_OPTIONS.map((day) => (
            <label key={day.jsDay} className="check-mini">
              <input
                type="checkbox"
                checked={training.cardioWeekdays.includes(day.jsDay)}
                onChange={() => {
                  const cardioWeekdays = training.cardioWeekdays.includes(day.jsDay)
                    ? training.cardioWeekdays.filter((item) => item !== day.jsDay)
                    : [...training.cardioWeekdays, day.jsDay];
                  patch({ ...training, cardioWeekdays });
                }}
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <h2>Sistemas</h2>
      {training.systems.map((item, index) => (
        <fieldset key={item.id} className="block">
          <input
            value={item.name}
            onChange={(event) => {
              const systems = training.systems.map((row, i) =>
                i === index ? { ...row, name: event.target.value } : row,
              );
              patch({ ...training, systems });
            }}
          />
          <input
            value={item.example}
            placeholder="Ejemplo en la rutina"
            onChange={(event) => {
              const systems = training.systems.map((row, i) =>
                i === index ? { ...row, example: event.target.value } : row,
              );
              patch({ ...training, systems });
            }}
          />
          <textarea
            rows={3}
            value={item.body}
            onChange={(event) => {
              const systems = training.systems.map((row, i) =>
                i === index ? { ...row, body: event.target.value } : row,
              );
              patch({ ...training, systems });
            }}
          />
          <button
            type="button"
            className="danger"
            onClick={() => patch({ ...training, systems: training.systems.filter((row) => row.id !== item.id) })}
          >
            Quitar sistema
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => patch({ ...training, systems: [...training.systems, emptySystem()] })}
      >
        Añadir sistema
      </button>

      <h2>% RM</h2>
      {training.rmNotes.map((item, index) => (
        <fieldset key={item.id} className="block">
          <div className="row-2">
            <input
              value={item.title}
              onChange={(event) => {
                const rmNotes = training.rmNotes.map((row, i) =>
                  i === index ? { ...row, title: event.target.value } : row,
                );
                patch({ ...training, rmNotes });
              }}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={item.percent}
              onChange={(event) => {
                const rmNotes = training.rmNotes.map((row, i) =>
                  i === index ? { ...row, percent: Number(event.target.value) || 0 } : row,
                );
                patch({ ...training, rmNotes });
              }}
            />
          </div>
          <textarea
            rows={2}
            value={item.body}
            onChange={(event) => {
              const rmNotes = training.rmNotes.map((row, i) =>
                i === index ? { ...row, body: event.target.value } : row,
              );
              patch({ ...training, rmNotes });
            }}
          />
          <button
            type="button"
            className="danger"
            onClick={() => patch({ ...training, rmNotes: training.rmNotes.filter((row) => row.id !== item.id) })}
          >
            Quitar
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => patch({ ...training, rmNotes: [...training.rmNotes, emptyRmNote()] })}
      >
        Añadir nota de RM
      </button>

      <h2>Días y ejercicios</h2>
      {training.sessions.map((session, sessionIndex) => (
        <SessionFields
          key={session.id}
          session={session}
          systems={training.systems}
          onChange={(next) => {
            const sessions = training.sessions.map((row, i) => (i === sessionIndex ? next : row));
            patch({ ...training, sessions });
          }}
          onRemove={() =>
            patch({
              ...training,
              sessions: training.sessions.filter((row) => row.id !== session.id),
            })
          }
        />
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => patch({ ...training, sessions: [...training.sessions, emptySession()] })}
      >
        Añadir día
      </button>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="save-bar">
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" onClick={onSave} disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </main>
  );
}

function SessionFields({
  session,
  systems,
  onChange,
  onRemove,
}: {
  session: TrainingSession;
  systems: TrainingPlan["systems"];
  onChange: (session: TrainingSession) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="block">
      <div className="row-2">
        <label>
          Etiqueta
          <input value={session.label} onChange={(event) => onChange({ ...session, label: event.target.value })} />
        </label>
        <label>
          Enfoque
          <input value={session.focus} onChange={(event) => onChange({ ...session, focus: event.target.value })} />
        </label>
      </div>
      <div className="row-2">
        <label>
          Bloque
          <select
            value={session.block}
            onChange={(event) => onChange({ ...session, block: event.target.value as TrainingBlock })}
          >
            {BLOCKS.map((block) => (
              <option key={block} value={block}>
                {BLOCK_LABEL[block]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Meta semanal (vacío = el día completo)
          <input
            type="number"
            min={0}
            max={7}
            value={session.weeklyGoal ?? ""}
            onChange={(event) =>
              onChange({
                ...session,
                weeklyGoal: event.target.value === "" ? null : Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </label>
      </div>
      <p className="meta">Días de la semana</p>
      <div className="weekday-picks">
        {WEEKDAY_OPTIONS.map((day) => (
          <label key={day.jsDay} className="check-mini">
            <input
              type="checkbox"
              checked={session.weekdays.includes(day.jsDay)}
              onChange={() => {
                const weekdays = session.weekdays.includes(day.jsDay)
                  ? session.weekdays.filter((item) => item !== day.jsDay)
                  : [...session.weekdays, day.jsDay];
                onChange({ ...session, weekdays });
              }}
            />
            {day.label}
          </label>
        ))}
      </div>
      <p className="meta">Semanas del bloque</p>
      <div className="weekday-picks">
        {[1, 2, 3, 4].map((week) => (
          <label key={week} className="check-mini">
            <input
              type="checkbox"
              checked={session.weeks.includes(week)}
              onChange={() => {
                const weeks = session.weeks.includes(week)
                  ? session.weeks.filter((item) => item !== week)
                  : [...session.weeks, week];
                onChange({ ...session, weeks });
              }}
            />
            S{week}
          </label>
        ))}
      </div>
      {session.exercises.map((exercise, index) => (
        <div key={exercise.id} className="option-edit">
          <label>
            Ejercicio
            <input
              value={exercise.name}
              onChange={(event) => {
                const exercises = session.exercises.map((row, i) =>
                  i === index ? { ...row, name: event.target.value } : row,
                );
                onChange({ ...session, exercises });
              }}
            />
          </label>
          <label>
            Series / reps
            <input
              value={exercise.prescription}
              onChange={(event) => {
                const exercises = session.exercises.map((row, i) =>
                  i === index ? { ...row, prescription: event.target.value } : row,
                );
                onChange({ ...session, exercises });
              }}
            />
          </label>
          <label>
            GIFs o imágenes (una por línea)
            <textarea
              rows={2}
              value={exercise.media.join("\n")}
              placeholder="/exercises/nombre.gif"
              onChange={(event) => {
                const media = event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean);
                const exercises = session.exercises.map((row, i) =>
                  i === index ? { ...row, media } : row,
                );
                onChange({ ...session, exercises });
              }}
            />
          </label>
          <label>
            Sistema
            <select
              value={exercise.systemId ?? ""}
              onChange={(event) => {
                const systemId = event.target.value || null;
                const exercises = session.exercises.map((row, i) =>
                  i === index ? { ...row, systemId } : row,
                );
                onChange({ ...session, exercises });
              }}
            >
              <option value="">Ninguno</option>
              {systems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="danger"
            onClick={() =>
              onChange({
                ...session,
                exercises: session.exercises.filter((row) => row.id !== exercise.id),
              })
            }
          >
            Quitar ejercicio
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => onChange({ ...session, exercises: [...session.exercises, emptyExercise()] })}
      >
        Añadir ejercicio
      </button>
      <button type="button" className="danger" onClick={onRemove}>
        Quitar día
      </button>
    </fieldset>
  );
}
