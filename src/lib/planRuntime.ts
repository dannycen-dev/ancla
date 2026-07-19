import type { Plan, WorkoutDayTemplate } from '../types'

export function getWeekOfCycle(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
  return ((week - 1) % 4) + 1
}

export function getBlockForWeek(weekOfCycle: number): 'fuerza' | 'hipertrofia' {
  return weekOfCycle === 1 || weekOfCycle === 3 ? 'fuerza' : 'hipertrofia'
}

export function getWorkoutForToday(plan: Plan, date = new Date()): WorkoutDayTemplate {
  const week = getWeekOfCycle(date)
  const block = getBlockForWeek(week)
  const pool = block === 'fuerza' ? plan.workouts.fuerzaWeek : plan.workouts.hipertrofiaWeek
  const dow = date.getDay()
  const found = pool.find((d: WorkoutDayTemplate) => d.dow === dow)
  if (found) return { ...found, block }

  return {
    dow,
    block,
    title: 'Descanso',
    focus: 'Recuperacion',
    isRest: true,
    cardio: false,
    workoutId: 'rest',
    exercises: [],
  }
}

export function mealsForSlot(plan: Plan, slot: string) {
  return plan.meals.filter((m: Plan['meals'][number]) => m.slot === slot)
}

export function pickDefaultMeal(plan: Plan, slot: string, seed: number) {
  const options = mealsForSlot(plan, slot)
  if (!options.length) return null
  const greens = options.filter((m: Plan['meals'][number]) => m.green)
  const pool = greens.length ? greens : options
  return pool[seed % pool.length]
}
