import { GREEN_MEAL_GOAL, WATER_GOAL_HALVES, emptyLog, type DayLog } from "./log.ts";
import type { Plan } from "./plan.ts";
import { eachDate, weekdayFromISO, sortSlots, variationIndex } from "./schedule.ts";

export type DayScore = {
  date: string;
  pct: number;
  mealsDone: number;
  mealsTotal: number;
  water: boolean;
  greens: boolean;
  tracked: boolean;
};

export function greenMealsForDay(plan: Plan, jsDay: number): { slotId: string; title: string }[] {
  return sortSlots(plan.schedule).flatMap((slot) => {
    if (slot.kind !== "meal" || !slot.mealId) return [];
    const meal = plan.meals.find((item) => item.id === slot.mealId);
    if (!meal) return [];
    const option = meal.options[variationIndex(jsDay, meal.options.length)];
    if (option?.tone !== "green") return [];
    return [{ slotId: slot.id, title: option.title }];
  });
}

export function scoreDay(plan: Plan, log: DayLog): DayScore {
  const jsDay = weekdayFromISO(log.date);
  const slots = plan.schedule;
  const mealsTotal = slots.length;
  const mealsDone = slots.filter((slot) => log.doneSlotIds.includes(slot.id)).length;
  const greensToday = greenMealsForDay(plan, jsDay);
  const greensDone = greensToday.filter((item) => log.doneSlotIds.includes(item.slotId)).length;
  const water = log.waterHalves >= WATER_GOAL_HALVES;
  const greens = greensDone >= GREEN_MEAL_GOAL;
  const total = mealsTotal + 2;
  const got = mealsDone + (water ? 1 : 0) + (greens ? 1 : 0);
  const tracked = mealsDone > 0 || log.waterHalves > 0 || log.zeroCalDrink || log.freeMeal || log.dietBreaks.length > 0;
  return {
    date: log.date,
    pct: total === 0 ? 0 : Math.round((got / total) * 100),
    mealsDone,
    mealsTotal,
    water,
    greens,
    tracked,
  };
}

export function cycleStats(plan: Plan, logs: DayLog[], today: string) {
  const start = plan.startedOn <= plan.consultOn ? plan.startedOn : plan.consultOn;
  const end = plan.consultOn >= plan.startedOn ? plan.consultOn : plan.startedOn;
  const elapsedEnd = today < end ? today : end;
  const elapsed = eachDate(start, elapsedEnd);
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const scores = elapsed.map((date) => {
    const log = byDate.get(date) ?? emptyLog(date);
    return scoreDay(plan, log);
  });
  const mealDone = scores.reduce((sum, day) => sum + day.mealsDone, 0);
  const mealTotal = scores.reduce((sum, day) => sum + day.mealsTotal, 0);
  const waterDays = scores.filter((day) => day.water).length;
  const greenDays = scores.filter((day) => day.greens).length;
  const strongDays = scores.filter((day) => day.pct >= 80).length;
  const remaining = today >= end ? 0 : eachDate(today, end).length - 1;
  return {
    start,
    end,
    elapsed: scores.length,
    remaining,
    mealPct: mealTotal === 0 ? 0 : Math.round((mealDone / mealTotal) * 100),
    mealDone,
    mealTotal,
    waterDays,
    greenDays,
    strongDays,
    scores,
  };
}
