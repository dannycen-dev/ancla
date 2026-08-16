import { useEffect, useState } from "react";
import { AuthError, askAdvice } from "./api.ts";

const PROMPTS = [
  { id: "hoy", label: "¿Cómo voy hoy?", question: "Con lo que llevo hoy, ¿cómo voy y qué me conviene cuidar el resto del día?" },
  { id: "compra", label: "Qué comprar", question: "Según la despensa y lo que se va a acabar, ¿qué me conviene comprar esta quincena?" },
  { id: "libre", label: "Comida libre", question: "¿Cómo uso mejor mis 3 comidas libres de la semana sin descarrilar el plan?" },
  { id: "quiebre", label: "Se rompió", question: "Si rompí la dieta, ¿cómo me reacomodo hoy y mañana sin compensar en exceso?" },
  { id: "gym", label: "Gym de hoy", question: "Según la rutina de hoy, ¿cómo la enfoco y qué cuido para no pasarme ni quedarme corto?" },
];

type CoachProps = {
  date: string;
  onAuthLost: () => void;
};

export function Coach({ date, onAuthLost }: CoachProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function ask(text: string) {
    const next = text.trim();
    if (!next || busy) return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const result = await askAdvice(date, next);
      setAnswer(result);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof Error ? err.message : "No se pudo consultar a la IA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="progress">
      <p className="eyebrow">Workers AI</p>
      <h1>Recomendaciones</h1>
      <p className="lede">
        Pregunta con el menú, el gym del día, el avance y la despensa. No sustituye al nutriólogo: es un empujón
        para acomodar el día.
      </p>
      {offline ? (
        <p className="banner">La IA necesita conexión. Tus marcas del día sí se guardan en el teléfono.</p>
      ) : null}

      <div className="option-tabs">
        {PROMPTS.map((item) => (
          <button key={item.id} type="button" disabled={busy} onClick={() => void ask(item.question)}>
            {item.label}
          </button>
        ))}
      </div>

      <label>
        Tu pregunta
        <textarea
          rows={3}
          value={question}
          placeholder="Ej. ¿Puedo mover la colación si salgo tarde?"
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      <button type="button" disabled={busy || !question.trim()} onClick={() => void ask(question)}>
        {busy ? "Pensando…" : "Preguntar"}
      </button>

      {error ? <p className="form-error">{error}</p> : null}

      {answer ? (
        <section className="panel coach-answer">
          <h2>Sugerencia</h2>
          <p className="coach-text">{answer}</p>
        </section>
      ) : null}
    </section>
  );
}
