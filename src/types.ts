export type MealSlot =
  | 'colacion1'
  | 'desayuno'
  | 'colacion2'
  | 'almuerzo'
  | 'colacion3'
  | 'cena'

export type MealOption = {
  id: string
  slot: MealSlot
  label: string
  items: string[]
  calories: number
  green?: boolean
  optional?: boolean
}

export type Exercise = {
  id: string
  name: string
  reps: string
  note?: string
}

export type ExerciseMedia = {
  datasetId: string
  nameEn: string
  equipment: string
  target: string
  bodyPart: string
  secondary: string[]
  instructionsEs: string
  stepsEs: string[]
  gif: string
  thumb: string
  attribution: string
  approx?: boolean
}

export type WorkoutDayTemplate = {
  dow: number
  block: 'fuerza' | 'hipertrofia' | string
  title: string
  focus: string
  isRest: boolean
  cardio: boolean
  workoutId: string
  exercises: Exercise[]
}

export type Plan = {
  version: number
  profile: {
    displayName: string
    planName: string
    goal: string
    goal2: string
    dailyBudget: number
    waterLiters: number
    freeMealsPerWeek: number
    greenMealsMin: number
    supplements: string[]
  }
  slots: {
    order: MealSlot[]
    required: MealSlot[]
    labels: Record<MealSlot, string>
    calories: Record<MealSlot, number>
  }
  meals: MealOption[]
  planRules: string[]
  craving: {
    steps: { id: string; title: string; body: string; action: string }[]
    swaps: { craving: string; swap: string; calories: string }[]
    focusRules: string[]
  }
  exerciseMedia: Record<string, ExerciseMedia>
  workouts: {
    weekStructure: { day: number; name: string; workoutId: string; cardio: boolean }[]
    abdomen: Exercise[]
    cardio: Exercise[]
    systems: { name: string; how: string }[]
    fuerzaWeek: WorkoutDayTemplate[]
    hipertrofiaWeek: WorkoutDayTemplate[]
  }
  copy: {
    onboardingLede: string
    progressNote: string
    brandEyebrow: string
    heroHint: string
  }
}

export type DayLog = {
  date: string
  meals: Partial<Record<MealSlot, { mealId: string; done: boolean }>>
  exercisesDone: string[]
  workoutDone: boolean
  cardioDone: boolean
  water: number
  omegaDone: boolean
  probioticDone: boolean
  freeMeal: boolean
  mood: 'ok' | 'hard' | 'great' | null
  note?: string
}
