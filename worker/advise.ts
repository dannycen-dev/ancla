import { coverProducts, formatMoney, formatRunOut } from "../shared/catalog.ts";
import { buildGrocery } from "../shared/grocery.ts";
import { liters, type DayLog } from "../shared/log.ts";
import type { PantryState } from "../shared/pantry.ts";
import { periodTitle, type PayPeriod } from "../shared/period.ts";
import type { Plan } from "../shared/plan.ts";
import {
  dayName,
  formatDayLong,
  formatTime12,
  variationIndex,
  weekdayFromISO,
} from "../shared/schedule.ts";
import {
  accessorySessions,
  cardioApplies,
  cycleWeek,
  isWeekendDay,
  mainSessionsForDate,
} from "../shared/training.ts";

export const ADVICE_MODEL = "@cf/meta/llama-3.2-3b-instruct";

const SYSTEM = `Eres el asistente de Ancla, la app del plan alimenticio y de entrenamiento de Dani.
Hablas en español de México, corto y claro. No eres el nutriólogo ni el entrenador: no cambies calorías, no sustituyas platillos y no reescribas la rutina como si fueras ellos.
Usa solo los datos del contexto. Si falta información, dilo.
Da 3 a 6 viñetas accionables. Si hubo comida libre o se rompió la dieta, sugiere cómo volver al plan sin culpa.
Recuerda: 3 comidas libres por semana, 2 comidas verdes al día, 3.5 L de agua, probióticos en ayunas, omega-3 con el desayuno.
El gym empieza el 17 de agosto de 2026. Días fuertes: lunes a viernes. Sábado y domingo son descanso; si va: cardio fácil, recuperar abdomen/antebrazo, o estimar RM con 1–2 básicos a 5–8 reps (pestaña RM), sin 1RM a muerte ni día pesado completo. Abdomen y antebrazo: 2 veces por semana (lunes y viernes). Cardio opcional lun–vie.`;

export async function runAdvice(
  ai: Ai,
  input: {
    plan: Plan;
    date: string;
    question: string;
    logs: DayLog[];
    pantry: PantryState | null;
    period: PayPeriod;
  },
): Promise<string> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), 12_000);
  });
  const result = await Promise.race([
    ai.run(ADVICE_MODEL, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${buildContext(input).slice(0, 6_000)}\n\nPregunta de Dani:\n${input.question}` },
      ],
      max_tokens: 350,
      temperature: 0.4,
    }),
    timeout,
  ]);
  const text = typeof result === "object" && result && "response" in result ? String(result.response) : "";
  const trimmed = text.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 4_000);
  if (!trimmed) throw new Error("La IA no devolvió texto.");
  return trimmed;
}

function buildContext(input: {
  plan: Plan;
  date: string;
  question: string;
  logs: DayLog[];
  pantry: PantryState | null;
  period: PayPeriod;
}): string {
  const { plan, date, logs, pantry, period } = input;
  const jsDay = weekdayFromISO(date);
  const todayLog = logs.find((item) => item.date === date);
  const weekFree = logs.filter((item) => item.freeMeal).length;
  const weekZero = logs.filter((item) => item.zeroCalDrink).length;
  const weekBreaks = logs.reduce((sum, item) => sum + item.dietBreaks.length, 0);
  const wantsGrocery = /compra|despensa|acaba|precio|super|súper/i.test(input.question);
  const coverages = wantsGrocery ? coverProducts(buildGrocery(plan, period), plan.products, period, plan) : [];
  const restock = coverages
    .filter((item) => item.packs > 0 && item.periodCost != null)
    .map((item) => `${item.product.name}: ${item.packs} empaque(s) ${formatMoney(item.periodCost ?? 0)}`)
    .join("; ");
  const runouts = coverages
    .filter((item) => item.runOutOnePack)
    .map((item) => `${item.product.name} se acaba el ${formatRunOut(item.runOutOnePack ?? "")}`)
    .join("; ");

  const menu = plan.schedule
    .map((slot) => {
      if (slot.kind === "supplement" || !slot.mealId) {
        return `- ${formatTime12(slot.time)} ${slot.title}${slot.detail ? `: ${slot.detail}` : ""}`;
      }
      const meal = plan.meals.find((item) => item.id === slot.mealId);
      if (!meal) return `- ${formatTime12(slot.time)} ${slot.title}`;
      const option = meal.options[variationIndex(jsDay, meal.options.length)];
      const items = option?.items.filter(Boolean).join("; ") ?? "";
      return `- ${formatTime12(slot.time)} ${meal.name}: ${option?.title ?? ""}. ${items}`;
    })
    .join("\n");

  const done = todayLog
    ? plan.schedule
        .filter((slot) => todayLog.doneSlotIds.includes(slot.id))
        .map((slot) => slot.title)
        .join(", ") || "nada marcado"
    : "sin registro";

  const breaks = todayLog?.dietBreaks.map((item) => item.text || "(sin detalle)").join(" | ") || "ninguna";
  const freeNote = todayLog?.freeMeal ? todayLog.freeMealNote || "sí, sin detalle" : "no";
  const consult =
    plan.consultOn >= period.start && plan.consultOn <= period.end
      ? `Consulta el ${formatDayLong(plan.consultOn)} por ${formatMoney(plan.consultFeeMxn)} (esta quincena).`
      : `Próxima consulta ${formatDayLong(plan.consultOn)} · ${formatMoney(plan.consultFeeMxn)}.`;

  const training = plan.training;
  const week = cycleWeek(date, training.startedOn, training.weekCount);
  const mains = mainSessionsForDate(training, date);
  const gymToday =
    mains.length === 0
      ? isWeekendDay(date)
        ? "Fin de semana de descanso. Si va: cardio fácil, recuperar abdomen/antebrazo, o estimar RM con 1–2 básicos a 5–8 reps (sin 1RM a muerte)."
        : "Descanso de pesas."
      : mains
          .map((session) => {
            const done = todayLog
              ? session.exercises.filter((item) => todayLog.doneExerciseIds.includes(item.id)).length
              : 0;
            const names = session.exercises.map((item) => item.name).join("; ");
            return `${session.label} ${session.focus} (${session.block}). ${done}/${session.exercises.length} ejercicios. ${names}`;
          })
          .join(" | ");
  const accessories = accessorySessions(training)
    .map((session) => {
      const weekDone = logs.filter((item) => item.doneSessionIds.includes(session.id)).length;
      return `${session.label} ${weekDone}/${session.weeklyGoal ?? 2} esta semana`;
    })
    .join("; ");
  const cardio =
    cardioApplies(training, date) || isWeekendDay(date)
      ? `Cardio opcional hoy (${training.cardioOptions.join(" / ")}). Hecho: ${todayLog?.cardioDone ? "sí" : "no"}.`
      : "Hoy no toca cardio de gym.";
  const gymClock =
    todayLog?.gymStartedAt || todayLog?.gymEndedAt
      ? `Gym inicio ${todayLog.gymStartedAt ?? "—"} / término ${todayLog.gymEndedAt ?? "—"}.`
      : "Sin hora de inicio/término de gym.";

  return `Fecha: ${dayName(jsDay)} ${formatDayLong(date)}
Objetivo: ${plan.goals.map((item) => item.title).join("; ")}
Cardio nutriólogo: ${plan.cardio}
Gym: semana ${week} de ${training.weekCount}, inicia ${training.startedOn}. ${gymToday}
Accesorios: ${accessories || "ninguno"}. ${cardio} ${gymClock}
Consulta: ${consult}
Quincena: ${periodTitle(period)} (${period.payLabel})
Menú de hoy:
${menu}
Avance de hoy: ${done}. Agua ${todayLog ? liters(todayLog.waterHalves) : "0"} L. Libre: ${freeNote}. Quiebres: ${breaks}.
Semana: ${weekFree}/3 libres, ${weekZero}/4 bebidas cero, ${weekBreaks} quiebres.
Despensa a reponer: ${restock || "nada con precio pendiente"}.
Caducidad de empaques: ${runouts || "sin datos"}.
Marcado en despensa: ${pantry?.checkedIds.length ?? 0} ítems.`;
}
