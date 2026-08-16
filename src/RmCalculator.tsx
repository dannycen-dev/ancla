import { useMemo, useState, type FormEvent } from "react";
import { PLAN_PERCENTS, RM_PERCENTS, estimateOneRm, percentOfRm } from "../shared/rm.ts";
import type { RmEntry } from "../shared/training.ts";

const STORAGE_KEY = "ancla-rm";

function readSaved(): { weight: string; reps: string; name: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { weight: "", reps: "", name: "" };
    const parsed = JSON.parse(raw) as { weight?: unknown; reps?: unknown; name?: unknown };
    return {
      weight: typeof parsed.weight === "string" ? parsed.weight : "",
      reps: typeof parsed.reps === "string" ? parsed.reps : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
    };
  } catch {
    return { weight: "", reps: "", name: "" };
  }
}

type RmCalculatorProps = {
  week: number;
  date: string;
  liftNames: string[];
  entries: RmEntry[];
  onSave: (entry: RmEntry) => void;
};

export function RmCalculator({ week, date, liftNames, entries, onSave }: RmCalculatorProps) {
  const saved = useMemo(() => readSaved(), []);
  const [weight, setWeight] = useState(saved.weight);
  const [reps, setReps] = useState(saved.reps);
  const [name, setName] = useState(saved.name);
  const [error, setError] = useState("");
  const [oneRm, setOneRm] = useState<number | null>(() => {
    const kg = Number(saved.weight.replace(",", "."));
    const count = Number(saved.reps);
    return estimateOneRm(kg, count);
  });
  const weekEntries = entries.filter((entry) => entry.week === week);

  function calculate(event?: FormEvent) {
    event?.preventDefault();
    const kg = Number(weight.replace(",", "."));
    const count = Number(reps);
    if (!Number.isFinite(kg) || kg <= 0) {
      setOneRm(null);
      setError("Escribe el peso que levantaste, en kilos.");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      setOneRm(null);
      setError("Las repeticiones deben ser entre 1 y 10.");
      return;
    }
    const result = estimateOneRm(kg, count);
    setOneRm(result);
    setError(result == null ? "No se pudo calcular." : "");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ weight, reps, name }));
    } catch {
      /* ignore quota */
    }
    if (result == null) return;
    onSave({
      id: "manual",
      name: name.trim(),
      date,
      week,
      weight: String(kg),
      reps: count,
      unit: "kg",
      estimatedRm: result,
    });
  }

  return (
    <section className="panel rm-box">
      <p className="eyebrow">1RM</p>
      <h2>Calculadora de repetición máxima</h2>
      <p className="lede">
        Mete un peso que hayas hecho cerca del fallo, entre 1 y 10 reps. Lo más fiable es 3 a 6. Usa
        la misma fórmula que la calculadora de Soy Powerlifter (Brzycki). Se guarda en la semana
        actual; el corte es lunes 1:00 a.m. para meter el RM del fin de semana.
      </p>

      <form className="rm-form" onSubmit={calculate}>
        <label>
          Ejercicio
          <input
            value={name}
            placeholder="press plano, hack…"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {liftNames.length > 0 ? (
          <div className="option-tabs" role="list">
            {liftNames.slice(0, 10).map((lift) => (
              <button
                key={lift}
                type="button"
                className={name === lift ? "is-active" : ""}
                onClick={() => setName(lift)}
              >
                {lift}
              </button>
            ))}
          </div>
        ) : null}
        <label>
          Peso levantado
          <input
            inputMode="decimal"
            value={weight}
            placeholder="kg"
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        <label>
          Repeticiones (1–10)
          <input
            inputMode="numeric"
            value={reps}
            placeholder="1–10"
            onChange={(event) => setReps(event.target.value)}
          />
        </label>
        <button type="submit">Calcular y guardar</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      {oneRm != null ? (
        <>
          <h3 className="rm-result">Repetición máxima ({oneRm} kg)</h3>
          <p className="meta">Los % de tu rutina (50, 60, 70, 80, 90) van marcados.</p>
          <div className="rm-grid">
            {RM_PERCENTS.map((percent) => (
              <p key={percent} className={PLAN_PERCENTS.has(percent) ? "is-plan" : ""}>
                {percent}% <strong>{percentOfRm(oneRm, percent)} kg</strong>
              </p>
            ))}
          </div>
        </>
      ) : null}

      {weekEntries.length > 0 ? (
        <>
          <p className="meta">Guardados en la semana {week}</p>
          <ul className="week-stats-list">
            {weekEntries.map((entry) => (
              <li key={`${entry.date}-${entry.id}-${entry.name}`}>
                <span>
                  <strong>{entry.name || "Sin nombre"}</strong>
                  <em>
                    {entry.reps}×{entry.weight} kg
                  </em>
                </span>
                <strong>{entry.estimatedRm} kg RM</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
