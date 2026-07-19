import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { apiLogout, apiMe, apiPlan } from './api'
import { ExerciseRow } from './components/ExerciseRow'
import { Login } from './components/Login'
import { useTracker } from './hooks/useTracker'
import {
  getBlockForWeek,
  getWeekOfCycle,
  getWorkoutForToday,
  mealsForSlot,
  pickDefaultMeal,
} from './lib/planRuntime'
import type { Exercise, MealOption, MealSlot, Plan } from './types'
import {
  BUDGET_MXN,
  DAYS,
  DEFAULT_PANTRY,
  MAGIC_RULES,
  build15DayBudgetCart,
  cartTotals,
  explain15DayNeeds,
  groupCartByStore,
  type PantryStock,
} from './lib/budgetCart'

type Tab = 'hoy' | 'dieta' | 'gym' | 'super' | 'antojo' | 'progreso'

const NAV: { id: Tab; label: string; ico: string }[] = [
  { id: 'hoy', label: 'Hoy', ico: '◉' },
  { id: 'dieta', label: 'Plan', ico: '🍴' },
  { id: 'gym', label: 'Gym', ico: '⌂' },
  { id: 'super', label: 'Super', ico: '🛒' },
  { id: 'antojo', label: 'Antojo', ico: '⚡' },
  { id: 'progreso', label: 'Racha', ico: '↑' },
]

function CheckIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7.2 5.4 10l6-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : null
}

export default function App() {
  const [auth, setAuth] = useState<'loading' | 'guest' | 'user'>('loading')
  const [username, setUsername] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [tab, setTab] = useState<Tab>('hoy')
  const [slot, setSlot] = useState<MealSlot>('desayuno')
  const [cravingStep, setCravingStep] = useState(0)
  const [showSwaps, setShowSwaps] = useState(false)
  const [openExercise, setOpenExercise] = useState<string | null>(null)
  const [bootError, setBootError] = useState('')
  const [bought, setBought] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('ancla-cart-15d')
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })
  const [includeOptional, setIncludeOptional] = useState(false)
  const [pantry, setPantry] = useState<PantryStock>(() => {
    try {
      const raw = localStorage.getItem('ancla-pantry')
      if (raw) return { ...DEFAULT_PANTRY, ...(JSON.parse(raw) as PantryStock) }
    } catch {
      // ignore
    }
    // Default actual del usuario (quincena)
    return { polloKg: 2, atunPiezas: 3, resKg: 0 }
  })

  const tracker = useTracker(plan)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await apiMe()
        if (!me.authenticated) {
          if (!cancelled) setAuth('guest')
          return
        }
        const { plan: p } = await apiPlan()
        if (cancelled) return
        setUsername(me.username || '')
        setPlan(p)
        setAuth('user')
        if (p.slots.order[0]) setSlot(p.slots.order[0])
      } catch {
        if (!cancelled) setAuth('guest')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLoginSuccess(user: string) {
    setBootError('')
    try {
      const { plan: p } = await apiPlan()
      setUsername(user)
      setPlan(p)
      setAuth('user')
      if (p.slots.order[0]) setSlot(p.slots.order[0])
    } catch (err) {
      setBootError(err instanceof Error ? err.message : 'No se pudo cargar el plan')
      setAuth('guest')
    }
  }

  async function handleLogout() {
    await apiLogout().catch(() => undefined)
    setPlan(null)
    setUsername('')
    setAuth('guest')
  }

  const week = getWeekOfCycle()
  const block = getBlockForWeek(week)
  const workout = useMemo(() => (plan ? getWorkoutForToday(plan) : null), [plan])
  const seed = Number(format(new Date(), 'd'))
  const cartItems = useMemo(() => {
    if (!plan) return []
    const all = build15DayBudgetCart(plan, pantry)
    return includeOptional ? all : all.filter((i) => i.essential)
  }, [plan, includeOptional, pantry])
  const cartGroups = useMemo(() => groupCartByStore(cartItems), [cartItems])
  const totals = useMemo(() => cartTotals(cartItems), [cartItems])
  const allCart = useMemo(() => (plan ? build15DayBudgetCart(plan, pantry) : []), [plan, pantry])
  const allTotals = useMemo(() => cartTotals(allCart), [allCart])
  const needs = useMemo(() => explain15DayNeeds(pantry), [pantry])

  useEffect(() => {
    try {
      localStorage.setItem('ancla-pantry', JSON.stringify(pantry))
    } catch {
      // ignore
    }
  }, [pantry])
  const shopTotal = cartItems.length
  const shopDone = cartItems.filter((i) => bought[i.id]).length
  const spentMarked = cartItems
    .filter((i) => bought[i.id])
    .reduce((n, i) => n + i.price, 0)

  useEffect(() => {
    try {
      localStorage.setItem('ancla-cart-15d', JSON.stringify(bought))
    } catch {
      // ignore
    }
  }, [bought])

  const toggleBought = (id: string) => {
    setBought((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const nextMealSlot = useMemo(() => {
    if (!plan) return null
    for (const s of plan.slots.required) {
      if (!tracker.today.meals[s]?.done) return s
    }
    return null
  }, [plan, tracker.today.meals])

  const suggestMeal = (s: MealSlot) => {
    if (!plan) return null
    const selectedId = tracker.today.meals[s]?.mealId
    if (selectedId) return plan.meals.find((m) => m.id === selectedId) ?? null
    return pickDefaultMeal(plan, s, seed + s.length)
  }

  const greenCount = useMemo(() => {
    if (!plan) return 0
    let n = 0
    for (const m of Object.values(tracker.today.meals)) {
      if (!m?.done) continue
      const meal = plan.meals.find((x) => x.id === m.mealId)
      if (meal?.green) n++
    }
    return n
  }, [plan, tracker.today.meals])

  if (auth === 'loading') {
    return (
      <div className="app-shell">
        <p className="lede">Cargando…</p>
      </div>
    )
  }

  if (auth === 'guest') {
    return (
      <>
        <Login onSuccess={handleLoginSuccess} />
        {bootError ? (
          <p className="form-error" style={{ textAlign: 'center' }}>
            {bootError}
          </p>
        ) : null}
      </>
    )
  }

  if (!plan || !workout || !tracker.ready) {
    return (
      <div className="app-shell">
        <p className="lede">Preparando tu plan…</p>
      </div>
    )
  }

  const profile = plan.profile
  const slots = plan.slots

  if (!tracker.onboardingDone) {
    return (
      <div className="app-shell">
        <div className="onboarding fade-in">
          <p className="eyebrow">
            {plan.copy.brandEyebrow} · {profile.planName}
          </p>
          <h1>
            Ancla<span>.</span>
          </h1>
          <p className="lede">{plan.copy.onboardingLede}</p>

          <div className="panel">
            <p className="eyebrow">Objetivo</p>
            <p className="check-title">{profile.goal}</p>
            <p className="check-sub" style={{ marginTop: 8 }}>
              {profile.goal2}
            </p>
          </div>

          <div className="stat-grid" style={{ marginBottom: 8 }}>
            <div className="stat">
              <strong>~{profile.dailyBudget}</strong>
              <span>kcal/dia</span>
            </div>
            <div className="stat">
              <strong>{profile.waterLiters}L</strong>
              <span>agua</span>
            </div>
            <div className="stat">
              <strong>{profile.freeMealsPerWeek}</strong>
              <span>libres/sem</span>
            </div>
          </div>

          <ul className="rules">
            {plan.planRules.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <button className="btn btn-primary" type="button" onClick={tracker.finishOnboarding}>
            Empezar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="top-actions">
        <span className="chip muted">{username}</span>
        <button className="btn-tiny" type="button" onClick={handleLogout}>
          Salir
        </button>
      </div>

      <header className="brand">
        <h1>
          Ancla<span>.</span>
        </h1>
        <div className="brand-meta">
          <div>{format(new Date(), 'EEE d MMM', { locale: es })}</div>
          <div>
            Semana {week}/4 · {block}
          </div>
        </div>
      </header>

      {tab === 'hoy' && (
        <div className="fade-in">
          <section className="hero-today">
            <p className="eyebrow">
              {profile.planName} · solo lo de ahora
            </p>
            <h2>
              {nextMealSlot
                ? `Siguiente: ${slots.labels[nextMealSlot]}`
                : workout.isRest
                  ? 'Dia ganado. Descansa.'
                  : tracker.today.workoutDone
                    ? 'Plan y gym listos'
                    : 'Toca entrenar'}
            </h2>
            <p>{plan.copy.heroHint}</p>
          </section>

          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat">
              <strong>{tracker.streak}</strong>
              <span>Racha</span>
            </div>
            <div className="stat">
              <strong>
                {tracker.mealsDoneCount}/{slots.required.length}
              </strong>
              <span>Comidas</span>
            </div>
            <div className="stat">
              <strong>
                {greenCount}/{profile.greenMealsMin}
              </strong>
              <span>Verdes</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <p className="eyebrow" style={{ margin: 0 }}>
                Comidas · ~{profile.dailyBudget} kcal
              </p>
              <span className={`chip ${greenCount >= profile.greenMealsMin ? '' : 'warn'}`}>
                {greenCount >= profile.greenMealsMin ? 'Verdes OK' : 'Faltan verdes'}
              </span>
            </div>
            {slots.order.map((s) => {
              const meal = suggestMeal(s)
              const done = tracker.today.meals[s]?.done
              const optional = s === 'colacion2'
              return (
                <button
                  key={s}
                  type="button"
                  className={`check-row ${done ? 'done' : ''}`}
                  onClick={() => tracker.toggleMealDone(s, meal?.id)}
                >
                  <span className="check-box">
                    <CheckIcon on={!!done} />
                  </span>
                  <span>
                    <p className="check-title">
                      {slots.labels[s]}
                      {optional ? ' (si hay hambre)' : ''}
                      {meal?.green ? ' · verde' : ''}
                      {` · ${slots.calories[s] || meal?.calories || 0} kcal`}
                    </p>
                    <p className="check-sub">{meal ? meal.label : 'Elige en Plan'}</p>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="panel">
            <div className="panel-head">
              <p className="eyebrow" style={{ margin: 0 }}>
                Entrenamiento
              </p>
              <span className="chip">{workout.focus}</span>
            </div>
            {workout.isRest ? (
              <p className="check-sub">Descanso. Sigue el plan de comidas igual.</p>
            ) : (
              <>
                <p className="check-title" style={{ marginBottom: 8 }}>
                  {workout.title}
                </p>
                <button
                  type="button"
                  className={`check-row ${tracker.today.workoutDone ? 'done' : ''}`}
                  onClick={() => tracker.setWorkoutDone(!tracker.today.workoutDone)}
                >
                  <span className="check-box">
                    <CheckIcon on={tracker.today.workoutDone} />
                  </span>
                  <span>
                    <p className="check-title">Marcar sesion completa</p>
                    <p className="check-sub">
                      {tracker.today.exercisesDone.length}/{workout.exercises.length} ejercicios
                    </p>
                  </span>
                </button>
                {workout.cardio && (
                  <button
                    type="button"
                    className={`check-row ${tracker.today.cardioDone ? 'done' : ''}`}
                    onClick={() => tracker.setCardioDone(!tracker.today.cardioDone)}
                  >
                    <span className="check-box">
                      <CheckIcon on={tracker.today.cardioDone} />
                    </span>
                    <span>
                      <p className="check-title">Cardio</p>
                      <p className="check-sub">Segun tu plan</p>
                    </span>
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() => setTab('gym')}
                >
                  Ver checklist del gym
                </button>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <p className="eyebrow" style={{ margin: 0 }}>
                Agua · suplementos · libre
              </p>
            </div>
            <button
              className="btn btn-soft"
              type="button"
              onClick={tracker.addWater}
              style={{ marginBottom: 12 }}
            >
              +1 vaso ({tracker.today.water}/7 ≈ {profile.waterLiters}L)
            </button>
            <button
              type="button"
              className={`check-row ${tracker.today.omegaDone ? 'done' : ''}`}
              onClick={tracker.toggleOmega}
            >
              <span className="check-box">
                <CheckIcon on={tracker.today.omegaDone} />
              </span>
              <span>
                <p className="check-title">{profile.supplements[0] || 'Suplemento 1'}</p>
              </span>
            </button>
            <button
              type="button"
              className={`check-row ${tracker.today.probioticDone ? 'done' : ''}`}
              onClick={tracker.toggleProbiotic}
            >
              <span className="check-box">
                <CheckIcon on={tracker.today.probioticDone} />
              </span>
              <span>
                <p className="check-title">{profile.supplements[1] || 'Suplemento 2'}</p>
              </span>
            </button>
            <button
              type="button"
              className={`check-row ${tracker.today.freeMeal ? 'done' : ''}`}
              onClick={tracker.toggleFreeMeal}
            >
              <span className="check-box">
                <CheckIcon on={tracker.today.freeMeal} />
              </span>
              <span>
                <p className="check-title">Use comida libre hoy</p>
                <p className="check-sub">
                  {tracker.freeMealsThisWeek}/{profile.freeMealsPerWeek} esta semana
                </p>
              </span>
            </button>
            <div className="mood-row" style={{ marginTop: 12 }}>
              {(
                [
                  ['great', 'Bien'],
                  ['ok', 'Meh'],
                  ['hard', 'Dificil'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={tracker.today.mood === id ? 'active' : ''}
                  onClick={() => tracker.setMood(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tracker.today.mood === 'hard' && (
              <button
                className="btn btn-ghost"
                type="button"
                style={{ marginTop: 12 }}
                onClick={() => setTab('antojo')}
              >
                Modo antojo →
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'dieta' && (
        <div className="fade-in">
          <p className="eyebrow">{profile.planName}</p>
          <h2 className="section-title">Tus opciones</h2>
          <p className="lede">Elige una opcion por tiempo de comida.</p>

          <div className="slot-tabs">
            {slots.order.map((s) => (
              <button
                key={s}
                type="button"
                className={slot === s ? 'active' : ''}
                onClick={() => setSlot(s)}
              >
                {slots.labels[s].split('·')[0].trim()}
                {slots.calories[s] ? ` · ${slots.calories[s]}` : ''}
              </button>
            ))}
          </div>

          <div className="meal-grid">
            {mealsForSlot(plan, slot).map((m: MealOption) => {
              const selected = tracker.today.meals[slot]?.mealId === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`meal-option ${selected ? 'selected' : ''}`}
                  onClick={() => tracker.selectMeal(slot, m.id)}
                >
                  <strong>
                    {m.label}
                    {m.green ? ' · verde' : ''}
                    {m.optional ? ' · opcional' : ''}
                    {` · ${m.calories} kcal`}
                  </strong>
                  <ul>
                    {m.items.map((item: string) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <p className="eyebrow">Reglas</p>
            <ul className="rules">
              {plan.planRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'gym' && (
        <div className="fade-in">
          <p className="eyebrow">
            Bloque {workout.block} · semana {week}/4
          </p>
          <h2 className="section-title">{workout.isRest ? 'Descanso' : workout.title}</h2>
          <p className="lede">Toca un ejercicio para ver guia. Marca cuando termines.</p>

          {!workout.isRest && (
            <div className="ex-list">
              {workout.exercises.map((ex: Exercise) => (
                <ExerciseRow
                  key={ex.id}
                  id={ex.id}
                  name={ex.name}
                  reps={ex.reps}
                  note={ex.note}
                  media={plan.exerciseMedia[ex.id] ?? null}
                  done={tracker.today.exercisesDone.includes(ex.id)}
                  expanded={openExercise === ex.id}
                  onToggleDone={() => tracker.toggleExercise(ex.id)}
                  onToggleExpand={() =>
                    setOpenExercise((cur) => (cur === ex.id ? null : ex.id))
                  }
                />
              ))}
            </div>
          )}

          {(workout.cardio || workout.isRest) && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panel-head">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Cardio
                </p>
              </div>
              {plan.workouts.cardio.map((ex) => (
                <ExerciseRow
                  key={ex.id}
                  id={ex.id}
                  name={ex.name}
                  reps={ex.reps}
                  note={ex.note}
                  media={plan.exerciseMedia[ex.id] ?? null}
                  done={tracker.today.cardioDone}
                  expanded={openExercise === ex.id}
                  onToggleDone={() => tracker.setCardioDone(!tracker.today.cardioDone)}
                  onToggleExpand={() =>
                    setOpenExercise((cur) => (cur === ex.id ? null : ex.id))
                  }
                />
              ))}
            </div>
          )}

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-head">
              <p className="eyebrow" style={{ margin: 0 }}>
                Abdomen
              </p>
            </div>
            <div className="ex-list">
              {plan.workouts.abdomen.map((ex) => (
                <ExerciseRow
                  key={ex.id}
                  id={ex.id}
                  name={ex.name}
                  reps={ex.reps}
                  note={ex.note}
                  media={plan.exerciseMedia[ex.id] ?? null}
                  done={tracker.today.exercisesDone.includes(ex.id)}
                  expanded={openExercise === ex.id}
                  onToggleDone={() => tracker.toggleExercise(ex.id)}
                  onToggleExpand={() =>
                    setOpenExercise((cur) => (cur === ex.id ? null : ex.id))
                  }
                />
              ))}
            </div>
          </div>

          <div className="panel">
            <p className="eyebrow">Sistemas</p>
            {plan.workouts.systems.map((s) => (
              <div key={s.name} style={{ marginBottom: 12 }}>
                <p className="check-title">{s.name}</p>
                <p className="check-sub">{s.how}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'super' && (
        <div className="fade-in">
          <p className="eyebrow">Despensa 15 dias</p>
          <h2 className="section-title">Super</h2>
          <p className="lede">
            Carrito {DAYS} dias · meta ${BUDGET_MXN.toLocaleString('es-MX')} (pasarse un poco OK si
            ahorras en lo que ya tienes). Ancla resta tu despensa. Anthropic viene despues.
          </p>

          <div className="panel" style={{ marginBottom: 12 }}>
            <p className="eyebrow">Lo que ya tienes</p>
            <div className="pantry-grid">
              <label>
                Pollo (kg)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={pantry.polloKg}
                  onChange={(e) =>
                    setPantry((p) => ({ ...p, polloKg: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label>
                Atun (pzas)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={pantry.atunPiezas}
                  onChange={(e) =>
                    setPantry((p) => ({ ...p, atunPiezas: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label>
                Res (kg)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={pantry.resKg}
                  onChange={(e) =>
                    setPantry((p) => ({ ...p, resKg: Number(e.target.value) || 0 }))
                  }
                />
              </label>
            </div>
            <p className="check-sub" style={{ marginTop: 8 }}>
              Con {pantry.polloKg} kg pollo + {pantry.atunPiezas} atun: compra res/molida y casi no
              mas pollo.
            </p>
          </div>

          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat">
              <strong>${Math.round(totals.essentialTotal || totals.allTotal)}</strong>
              <span>Esenciales</span>
            </div>
            <div className="stat">
              <strong>${Math.round(BUDGET_MXN - (includeOptional ? totals.allTotal : allTotals.essentialTotal))}</strong>
              <span>Quedan</span>
            </div>
            <div className="stat">
              <strong>
                {shopDone}/{shopTotal}
              </strong>
              <span>Listos</span>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 12 }}>
            <div className="panel-head">
              <p className="eyebrow" style={{ margin: 0 }}>
                Presupuesto
              </p>
              <span className={`chip ${totals.allTotal <= BUDGET_MXN || !includeOptional ? '' : 'warn'}`}>
                ${Math.round(includeOptional ? totals.allTotal : allTotals.essentialTotal)} / ${BUDGET_MXN}
              </span>
            </div>
            <div className="budget-bar" aria-hidden>
              <span
                style={{
                  width: `${Math.min(100, ((includeOptional ? totals.allTotal : allTotals.essentialTotal) / BUDGET_MXN) * 100)}%`,
                }}
              />
            </div>
            <p className="check-sub" style={{ marginTop: 10 }}>
              Sam&apos;s ~${Math.round(includeOptional ? totals.sams : allTotals.sams)} · Dunosusa ~$
              {Math.round(includeOptional ? totals.dunosusa : allTotals.dunosusa)} · Walmart ~$
              {Math.round(includeOptional ? totals.walmart : allTotals.walmart)}
              {spentMarked > 0 ? ` · Marcado $${Math.round(spentMarked)}` : ''}
            </p>
            <p className="check-sub" style={{ marginTop: 6 }}>
              Similares (aparte): proteina $314 + omega $194 + probioticos $51 = ~$
              {Math.round(allTotals.supplementsTotal || 559)} — no sale de los $1,500 de comida
            </p>
            <button
              type="button"
              className={`chip ${includeOptional ? '' : 'muted'}`}
              style={{ marginTop: 10 }}
              onClick={() => setIncludeOptional((v) => !v)}
            >
              {includeOptional
                ? 'Opcionales + Similares ON'
                : 'Solo despensa esencial (~$1,500)'}
            </button>
          </div>

          <div className="panel">
            <p className="eyebrow">Por que estas cantidades</p>
            {needs.map((n) => (
              <div key={n.label} style={{ marginBottom: 10 }}>
                <p className="check-title">
                  {n.label}: {n.need}
                </p>
                <p className="check-sub">{n.why}</p>
              </div>
            ))}
          </div>

          <div className="panel">
            <p className="eyebrow">Reglas de magia</p>
            {MAGIC_RULES.map((rule) => (
              <p className="check-sub" key={rule} style={{ marginBottom: 8 }}>
                {rule}
              </p>
            ))}
          </div>

          {cartGroups.map((group) =>
            group.items.length === 0 ? null : (
              <div className="panel" key={group.store}>
                <div className="panel-head">
                  <p className="eyebrow" style={{ margin: 0 }}>
                    {group.label}
                  </p>
                  <span className="chip muted">${Math.round(group.total)}</span>
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`check-row ${bought[item.id] || item.owned ? 'done' : ''}`}
                    onClick={() => !item.owned && toggleBought(item.id)}
                  >
                    <span className="check-box">
                      <CheckIcon on={!!bought[item.id]} />
                    </span>
                    <span style={{ flex: 1 }}>
                      <p className="check-title">
                        {item.name}
                        {!item.essential ? (item.id === 'alpura-pack' ? ' (trampa)' : ' (opcional)') : ''}
                      </p>
                      <p className="check-sub">
                        {item.qty}
                        {item.note ? ` — ${item.note}` : ''}
                      </p>
                      {item.swap ? (
                        <p className="swap-line">Si no cabe: {item.swap}</p>
                      ) : null}
                    </span>
                    <span className="price-tag">
                      {item.owned ? 'ok' : item.price <= 0 ? '—' : `$${Math.round(item.price)}`}
                    </span>
                  </button>
                ))}
              </div>
            ),
          )}

          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setBought({})}
            style={{ marginTop: 4 }}
          >
            Reiniciar checklist
          </button>
        </div>
      )}

      {tab === 'antojo' && (
        <div className="fade-in">
          <p className="eyebrow">Protocolo</p>
          <h2 className="section-title">El antojo no manda</h2>
          <p className="lede">Sigue los pasos. Prefiere opciones de tu plan.</p>

          {!showSwaps ? (
            <div className="step-list">
              {plan.craving.steps.map((step, i) => {
                const active = i === cravingStep
                const done = i < cravingStep
                if (!active && !done) return null
                return (
                  <div key={step.id} className={`step ${done ? 'done' : ''}`}>
                    <div className="step-num">Paso {i + 1}</div>
                    <p className="check-title">{step.title}</p>
                    <p className="check-sub" style={{ marginBottom: 12 }}>
                      {step.body}
                    </p>
                    {active && (
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => {
                          if (step.id === 'swap' || i === plan.craving.steps.length - 1) {
                            setShowSwaps(true)
                          } else {
                            setCravingStep(i + 1)
                          }
                        }}
                      >
                        {step.action}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="meal-grid">
                {plan.craving.swaps.map((s) => (
                  <div key={s.craving} className="meal-option selected">
                    <strong>{s.craving}</strong>
                    <p className="check-sub" style={{ marginTop: 6 }}>
                      → {s.swap}
                    </p>
                    <span className="chip" style={{ marginTop: 10 }}>
                      {s.calories}
                    </span>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-primary"
                type="button"
                style={{ marginTop: 14 }}
                onClick={() => {
                  setShowSwaps(false)
                  setCravingStep(0)
                  setTab('hoy')
                }}
              >
                Volver a Hoy
              </button>
            </>
          )}

          <div className="panel" style={{ marginTop: 16 }}>
            <p className="eyebrow">Reglas de foco</p>
            <ul className="rules">
              {plan.craving.focusRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'progreso' && (
        <div className="fade-in">
          <p className="eyebrow">Consistencia</p>
          <h2 className="section-title">Tu racha</h2>
          <p className="lede">{plan.copy.progressNote}</p>

          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat">
              <strong>{tracker.streak}</strong>
              <span>Actual</span>
            </div>
            <div className="stat">
              <strong>{tracker.weekStats.filter((d) => d.won).length}</strong>
              <span>Esta sem</span>
            </div>
            <div className="stat">
              <strong>
                {tracker.freeMealsThisWeek}/{profile.freeMealsPerWeek}
              </strong>
              <span>Libres</span>
            </div>
          </div>

          <div className="panel">
            <p className="eyebrow">Ultimos 7 dias</p>
            <div className="week-bars">
              {tracker.weekStats.map((d) => {
                const h = Math.max(8, d.score * 10)
                const label = format(new Date(d.date + 'T12:00:00'), 'EEEEE', { locale: es })
                return (
                  <div
                    key={d.date}
                    className={`bar ${d.won ? 'won' : ''}`}
                    style={{ height: h }}
                  >
                    <span>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="nav" aria-label="Navegacion">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            <span className="nav-ico">{item.ico}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
