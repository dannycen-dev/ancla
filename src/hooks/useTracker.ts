import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { apiGetLog, apiPutLog, apiWeekLogs } from '../api'
import type { DayLog, MealSlot, Plan } from '../types'

function emptyDay(date: string): DayLog {
  return {
    date,
    meals: {},
    exercisesDone: [],
    workoutDone: false,
    cardioDone: false,
    water: 0,
    omegaDone: false,
    probioticDone: false,
    freeMeal: false,
    mood: null,
  }
}

function todayKey(d = new Date()) {
  return format(d, 'yyyy-MM-dd')
}

function isDayWon(log: DayLog, required: MealSlot[]) {
  const mealsDone = required.filter((s) => log.meals[s]?.done).length
  return mealsDone >= 3 || log.workoutDone
}

function dayScore(log: DayLog, required: MealSlot[]) {
  const mealsDone = required.filter((s) => log.meals[s]?.done).length
  let score = mealsDone
  if (log.workoutDone) score += 2
  if (log.cardioDone) score += 1
  if (log.water >= 7) score += 1
  if (log.omegaDone) score += 1
  if (log.probioticDone) score += 1
  return score
}

export function useTracker(plan: Plan | null) {
  const key = todayKey()
  const required = plan?.slots.required ?? []
  const [today, setToday] = useState<DayLog>(() => emptyDay(key))
  const [weekLogs, setWeekLogs] = useState<Record<string, DayLog>>({})
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try {
      return localStorage.getItem('ancla-onboarding') === '1'
    } catch {
      return false
    }
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!plan) return
    let cancelled = false
    ;(async () => {
      try {
        const [{ log }, week] = await Promise.all([apiGetLog(key), apiWeekLogs()])
        if (cancelled) return
        setToday(log ?? emptyDay(key))
        setWeekLogs(week.logs || {})
      } catch {
        if (!cancelled) setToday(emptyDay(key))
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [plan, key])

  const persist = useCallback(
    async (next: DayLog) => {
      setToday(next)
      setWeekLogs((prev) => ({ ...prev, [next.date]: next }))
      try {
        await apiPutLog(next.date, next)
      } catch {
        // keep UI optimistic; retry happens on next change
      }
    },
    [],
  )

  const patchToday = useCallback(
    (fn: (log: DayLog) => DayLog) => {
      setToday((prev) => {
        const next = fn(prev)
        void persist(next)
        return next
      })
    },
    [persist],
  )

  const finishOnboarding = () => {
    localStorage.setItem('ancla-onboarding', '1')
    setOnboardingDone(true)
  }

  const selectMeal = (slot: MealSlot, mealId: string) => {
    patchToday((log) => ({
      ...log,
      meals: {
        ...log.meals,
        [slot]: { mealId, done: log.meals[slot]?.done ?? false },
      },
    }))
  }

  const toggleMealDone = (slot: MealSlot, fallbackMealId?: string) => {
    patchToday((log) => {
      const cur = log.meals[slot]
      if (!cur) {
        if (!fallbackMealId) return log
        return {
          ...log,
          meals: { ...log.meals, [slot]: { mealId: fallbackMealId, done: true } },
        }
      }
      return {
        ...log,
        meals: { ...log.meals, [slot]: { ...cur, done: !cur.done } },
      }
    })
  }

  const toggleExercise = (id: string) => {
    patchToday((log) => {
      const has = log.exercisesDone.includes(id)
      return {
        ...log,
        exercisesDone: has
          ? log.exercisesDone.filter((x) => x !== id)
          : [...log.exercisesDone, id],
      }
    })
  }

  const setWorkoutDone = (done: boolean) => patchToday((log) => ({ ...log, workoutDone: done }))
  const setCardioDone = (done: boolean) => patchToday((log) => ({ ...log, cardioDone: done }))
  const addWater = () => patchToday((log) => ({ ...log, water: Math.min(14, log.water + 1) }))
  const setMood = (mood: DayLog['mood']) => patchToday((log) => ({ ...log, mood }))
  const toggleOmega = () => patchToday((log) => ({ ...log, omegaDone: !log.omegaDone }))
  const toggleProbiotic = () =>
    patchToday((log) => ({ ...log, probioticDone: !log.probioticDone }))
  const toggleFreeMeal = () => patchToday((log) => ({ ...log, freeMeal: !log.freeMeal }))

  const weekStats = useMemo(() => {
    const days: { date: string; score: number; won: boolean; freeMeal: boolean }[] = []
    const d = new Date()
    d.setDate(d.getDate() - 6)
    for (let i = 0; i < 7; i++) {
      const k = todayKey(d)
      const log = k === key ? today : weekLogs[k]
      days.push({
        date: k,
        score: log ? dayScore(log, required) : 0,
        won: log ? isDayWon(log, required) : false,
        freeMeal: !!log?.freeMeal,
      })
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [weekLogs, today, key, required])

  const streak = useMemo(() => {
    let s = 0
    const d = new Date()
    for (let i = 0; i < 120; i++) {
      const k = todayKey(d)
      const log = k === key ? today : weekLogs[k]
      if (!log || !isDayWon(log, required)) {
        if (i === 0) {
          d.setDate(d.getDate() - 1)
          continue
        }
        break
      }
      s++
      d.setDate(d.getDate() - 1)
    }
    return s
  }, [today, weekLogs, key, required])

  const mealsDoneCount = required.filter((s) => today.meals[s]?.done).length
  const freeMealsThisWeek = weekStats.filter((d) => d.freeMeal).length

  return {
    ready,
    today,
    onboardingDone,
    mealsDoneCount,
    weekStats,
    freeMealsThisWeek,
    streak,
    bestStreak: streak,
    finishOnboarding,
    selectMeal,
    toggleMealDone,
    toggleExercise,
    setWorkoutDone,
    setCardioDone,
    addWater,
    setMood,
    toggleOmega,
    toggleProbiotic,
    toggleFreeMeal,
  }
}
