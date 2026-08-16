import { useMemo, useState, type FormEvent } from "react";
import { PLAN_PERCENTS, RM_PERCENTS, estimateOneRm, percentOfRm } from "../shared/rm.ts";

const STORAGE_KEY = "ancla-rm";

function readSaved(): { weight: string; reps: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { weight: "", reps: "" };
    const parsed = JSON.parse(raw) as { weight?: unknown; reps?: unknown };
    return {
      weight: typeof parsed.weight === "string" ? parsed.weight : "",
      reps: typeof parsed.reps === "string" ? parsed.reps : "",
    };
  } catch {
    return { weight: "", reps: "" };
  }
}

export function RmCalculator() {
  const saved = useMemo(() => readSaved(), []);
  const [weight, setWeight] = useState(saved.weight);
  const [reps, setReps] = useState(saved.reps);
  const [error, setError] = useState("");
  const [oneRm, setOneRm] = useState<number | null>(() => {
    const kg = Number(saved.weight.replace(",", "."));
    const count = Number(saved.reps);
    return estimateOneRm(kg, count);
  });

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ weight, reps }));
    } catch {
      /* ignore quota */
    }
  }

  return (
    <section className="panel rm-box">
      <p className="eyebrow">1RM</p>
      <h2>Calculadora de repetición máxima</h2>
      <p className="lede">
        Mete un peso que hayas hecho cerca del fallo, entre 1 y 10 reps. Lo más fiable es 3 a 6. Usa
        la misma fórmula que la calculadora de Soy Powerlifter (Brzycki).
      </p>

      <form className="rm-form" onSubmit={calculate}>
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
        <button type="submit">Calcular</button>
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
    </section>
  );
}
