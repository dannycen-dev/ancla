import type { Plan } from '../types'

export type Store = 'sams' | 'dunosusa' | 'walmart' | 'similares' | 'super'

export type CartItem = {
  id: string
  name: string
  qty: string
  gramsHint?: number
  store: Store
  price: number
  note?: string
  swap?: string
  essential: boolean
  /** Si true, no cuenta en el gasto (ya lo tienes / no comprar). */
  owned?: boolean
}

export type PantryStock = {
  polloKg: number
  atunPiezas: number
  /** kg de res/molida que ya tienes */
  resKg: number
}

export const DEFAULT_PANTRY: PantryStock = {
  polloKg: 0,
  atunPiezas: 0,
  resKg: 0,
}

export const STORE_LABELS: Record<Store, string> = {
  sams: "Sam's Club",
  dunosusa: 'Dunosusa',
  walmart: 'Walmart',
  similares: 'Farmacias Similares',
  super: 'Otro super',
}

export const BUDGET_MXN = 1500
export const DAYS = 15

/** Necesidad cruda 15 dias (antes de restar despensa). */
const NEED = {
  polloKg: 2.8,
  /** ~3 almuerzos de pescado si hay atun */
  atunMeals: 3,
  resKgUse: 1.0,
  huevos: 36,
  jamonG: 400,
}

/**
 * Carrito 15 dias adaptado a lo que YA tienes en refrigerador.
 * Precios reales usuario (Sam's / Walmart / Similares) + Dunosusa.
 */
export function build15DayBudgetCart(plan: Plan, pantry: PantryStock = DEFAULT_PANTRY): CartItem[] {
  void plan.profile.dailyBudget

  const polloNeed = Math.max(0, Math.round((NEED.polloKg - pantry.polloKg) * 10) / 10)
  const atunCoversMeals = Math.min(NEED.atunMeals, pantry.atunPiezas)
  // Atun reemplaza ~0.15 kg pollo por comida
  const polloSavedByAtun = Math.round(atunCoversMeals * 0.15 * 10) / 10
  const polloBuy = Math.max(0, Math.round((polloNeed - polloSavedByAtun) * 10) / 10)

  const resHave = pantry.resKg
  const resBuyKg = Math.max(0, NEED.resKgUse - resHave)
  // Paquete Sam's ~2 kg: si necesitas >=0.7 kg, conviene el paquete y congelar
  const buyMolidaPack = resBuyKg >= 0.7
  const molidaPrice = buyMolidaPack ? 298.7 : resBuyKg > 0 ? Math.round(resBuyKg * 149.35) : 0

  const items: CartItem[] = []

  const add = (item: CartItem) => {
    items.push(item)
  }

  // ---- YA TIENES (informativo) ----
  if (pantry.polloKg > 0) {
    add({
      id: 'stock-pollo',
      name: `Ya tienes: pechuga de pollo ${pantry.polloKg} kg`,
      qty: 'en refrigerador / congelador',
      store: 'dunosusa',
      price: 0,
      note: `Cubre gran parte de almuerzo/cena. Falta comprar ~${polloBuy} kg (atun cubre ~${atunCoversMeals} comidas).`,
      owned: true,
      essential: true,
    })
  }
  if (pantry.atunPiezas > 0) {
    add({
      id: 'stock-atun',
      name: `Ya tienes: atun congelado x${pantry.atunPiezas}`,
      qty: `${atunCoversMeals} almuerzos tipo pescado del plan`,
      store: 'dunosusa',
      price: 0,
      note: 'Usa 170 g pescado a la plancha (almuerzo basico). No compres mas pescado esta quincena.',
      owned: true,
      essential: true,
    })
  }

  // ---- SAM'S ----
  add({
    id: 'mezcla-cali',
    name: "Mezcla California Member's Mark 2.5 kg",
    qty: '1 bolsa',
    gramsHint: 2500,
    store: 'sams',
    price: 165.72,
    note: 'Verdura ~160 g/dia. Buen mayoreo.',
    swap: 'Verdura congelada generica o fresco en oferta.',
    essential: true,
  })

  if (buyMolidaPack) {
    add({
      id: 'molida-sams',
      name: 'Carne molida 90/10 res (~2 kg)',
      qty: '1 paquete — usas ~1 kg, congela 1 kg',
      gramsHint: 2000,
      store: 'sams',
      price: 298.7,
      note: 'Si: te completa la quincena con wraps/burgers + variedad. Congela mitad.',
      swap: 'Si no hay Sam\'s hoy: 1 kg molida en Dunosusa (~$150).',
      essential: true,
    })
  } else if (resBuyKg > 0) {
    add({
      id: 'molida-duno',
      name: 'Carne molida / res magra',
      qty: `${resBuyKg} kg`,
      store: 'dunosusa',
      price: molidaPrice,
      note: 'Cantidad justa sin mayoreo.',
      essential: true,
    })
  } else {
    add({
      id: 'stock-res',
      name: 'Ya tienes suficiente res/molida',
      qty: `${resHave} kg`,
      store: 'sams',
      price: 0,
      owned: true,
      essential: true,
    })
  }

  // ---- DUNOSUSA / carne restante ----
  if (polloBuy >= 0.3) {
    add({
      id: 'pollo',
      name: 'Pechuga de pollo (complemento)',
      qty: `${polloBuy} kg`,
      gramsHint: Math.round(polloBuy * 1000),
      store: 'dunosusa',
      price: Math.round(polloBuy * 110),
      note: `Solo el faltante. Ya tienes ${pantry.polloKg} kg + ${atunCoversMeals} atunes.`,
      swap: 'Si el kg esta caro: omite y sube 2 cenas avena / usa mas molida.',
      essential: true,
    })
  } else {
    add({
      id: 'pollo-skip',
      name: 'NO hace falta mas pollo',
      qty: '0 kg',
      store: 'dunosusa',
      price: 0,
      note: 'Con 2 kg + atun + res cubres la quincena. Ahorro grande.',
      owned: true,
      essential: true,
    })
  }

  add({
    id: 'huevos',
    name: 'Huevos',
    qty: '3 docenas (36)',
    store: 'dunosusa',
    price: 55,
    note: 'Desayuno base. Prioridad alta.',
    swap: 'Marca blanca siempre.',
    essential: true,
  })
  add({
    id: 'jamon',
    name: 'Jamon pechuga de pavo (granel)',
    qty: '350-400 g',
    store: 'dunosusa',
    price: 70,
    note: 'NO el FUD 1 kg Sam\'s.',
    swap: 'Pollo deshebrado del que ya tienes en el desayuno.',
    essential: true,
  })
  add({
    id: 'manzana',
    name: 'Manzana',
    qty: '2 kg',
    store: 'dunosusa',
    price: 60,
    note: 'Colacion 1 barata.',
    essential: true,
  })
  add({
    id: 'platano',
    name: 'Platano',
    qty: '1.2 kg',
    store: 'dunosusa',
    price: 22,
    essential: true,
  })
  add({
    id: 'aguacate',
    name: 'Aguacate',
    qty: '4-5 pzas',
    store: 'dunosusa',
    price: 65,
    swap: 'Si caro: 2-3 pzas.',
    essential: true,
  })
  add({
    id: 'fresco',
    name: 'Jitomate + pepino + lechuga',
    qty: '1 + 1 + 1',
    store: 'dunosusa',
    price: 55,
    essential: true,
  })
  add({
    id: 'tortillas-maiz',
    name: 'Tortillas de maiz',
    qty: '1 paquete',
    store: 'dunosusa',
    price: 28,
    essential: true,
  })
  add({
    id: 'frijoles',
    name: 'Frijoles bayos refritos',
    qty: '2 latas',
    store: 'dunosusa',
    price: 36,
    essential: true,
  })

  // ---- WALMART ----
  add({
    id: 'leche-vegetal',
    name: "Nature's Heart 3-pack almendra/avena sin azucar",
    qty: '~2.8 L',
    store: 'walmart',
    price: 110,
    note: 'Batido 15 dias. Buen precio.',
    swap: 'Agua + scoop si no cabe.',
    essential: true,
  })
  add({
    id: 'leche-light',
    name: 'Leche deslactosada light suelta',
    qty: '1.5 L (NO pack 6 L)',
    store: 'walmart',
    price: 45,
    note: 'Evita Alpura 6x1L a $177.',
    essential: true,
  })
  add({
    id: 'yogur',
    name: 'Yogurt griego ~900 g (sin azucar si puedes)',
    qty: '1 pote',
    store: 'walmart',
    price: 82,
    swap: 'Natural light + scoop.',
    essential: true,
  })
  add({
    id: 'avena',
    name: 'Avena 500 g',
    qty: '1 bolsa',
    store: 'walmart',
    price: 32,
    essential: true,
  })
  add({
    id: 'tipikas',
    name: 'Tortillas Tipikas integral',
    qty: '1 paquete ($19)',
    store: 'walmart',
    price: 19,
    note: 'Wraps baratos.',
    swap: 'Tortilla de maiz.',
    essential: true,
  })
  add({
    id: 'salsa',
    name: 'Salsa verde + al gusto',
    qty: '2 piezas',
    store: 'walmart',
    price: 45,
    essential: true,
  })

  // opcionales comida
  add({
    id: 'crotones',
    name: 'Crutones (opcional)',
    qty: 'evitar $43',
    store: 'walmart',
    price: 43,
    note: 'No vale la pena.',
    swap: 'Tortilla tostada quebrada.',
    essential: false,
  })

  // ---- SIMILARES ----
  add({
    id: 'prot-xgear',
    name: 'X-Gear Low Carb Protein 450 g',
    qty: '1 bote (~15 scoops)',
    store: 'similares',
    price: 314,
    note: '1 scoop/dia = 15 dias justos.',
    swap: 'Si no cabe este mes: comida primero.',
    essential: false,
  })
  add({
    id: 'omega-simi',
    name: 'Simi Omega RX 60 caps',
    qty: '1 frasco (~30 dias a 2/dia)',
    store: 'similares',
    price: 194,
    essential: false,
  })
  add({
    id: 'probio-simi',
    name: 'Simi Probioticos 30 masticables',
    qty: '1 caja',
    store: 'similares',
    price: 51,
    note: 'Barato. Prioridad #1 entre suplementos.',
    essential: false,
  })
  add({
    id: 'creatina-xgear',
    name: 'X-Gear Creatina 150 g (30 x 5 g)',
    qty: '1 bote',
    store: 'similares',
    price: 240,
    note: 'PRECIO REAL $240. Plan pide 2 scoops/dia (10 g) => dura ~15 dias, no 30. Promo 3x2 solo si tienes cash extra.',
    swap: 'Si aprieta: 1 scoop/dia (5 g) y te dura el mes; mejor que no comprar.',
    essential: false,
  })

  return items
}

export function cartTotals(items: CartItem[]) {
  const skip = new Set(['alpura-pack'])
  const billable = items.filter((i) => !skip.has(i.id) && !i.owned && i.price > 0)
  const food = billable.filter((i) => i.store !== 'similares')
  const supplements = billable.filter((i) => i.store === 'similares')
  const essential = food.filter((i) => i.essential)
  const optionalFood = food.filter((i) => !i.essential)
  const sum = (list: CartItem[]) => list.reduce((n, i) => n + i.price, 0)
  const byStore = (store: Store) =>
    billable.filter((i) => i.store === store).reduce((n, i) => n + i.price, 0)

  return {
    essentialTotal: sum(essential),
    optionalTotal: sum(optionalFood),
    allTotal: sum(food),
    supplementsTotal: sum(supplements),
    grandTotal: sum(billable),
    sams: byStore('sams'),
    dunosusa: byStore('dunosusa'),
    walmart: byStore('walmart'),
    similares: byStore('similares'),
    super: byStore('super'),
    remainingEssential: BUDGET_MXN - sum(essential),
    remainingAll: BUDGET_MXN - sum(food),
    savedByStock: items.filter((i) => i.owned).length,
  }
}

export function groupCartByStore(items: CartItem[]) {
  const order: Store[] = ['sams', 'dunosusa', 'walmart', 'similares', 'super']
  return order.map((store) => ({
    store,
    label: STORE_LABELS[store],
    items: items.filter((i) => i.store === store),
    total: items
      .filter((i) => i.store === store && !i.owned && i.price > 0)
      .reduce((n, i) => n + i.price, 0),
  }))
}

export function explain15DayNeeds(pantry: PantryStock = DEFAULT_PANTRY) {
  const polloBuy = Math.max(0, NEED.polloKg - pantry.polloKg - pantry.atunPiezas * 0.15)
  return [
    {
      label: 'Pollo',
      need: pantry.polloKg > 0 ? `ya ${pantry.polloKg} kg → compra ~${Math.max(0, Math.round(polloBuy * 10) / 10)} kg` : '~2.8 kg',
      why: 'Atun y res bajan lo que falta.',
    },
    {
      label: 'Atun',
      need: pantry.atunPiezas > 0 ? `${pantry.atunPiezas} pzas (no compres mas)` : 'opcional',
      why: 'Sustituye almuerzo pescado del plan.',
    },
    {
      label: 'Res / molida',
      need: 'paquete ~2 kg Sam\'s (congela 1 kg)',
      why: 'Completa la quincena con variedad.',
    },
    {
      label: 'Creatina',
      need: '150 g X-Gear $240',
      why: 'A 10 g/dia (2 scoops) dura ~15 dias. Promo 3x2 solo con cash extra.',
    },
  ]
}

export const MAGIC_RULES = [
  'Los $1,500 son meta de ahorro en DESPENSA; pasarse un poco esta bien si no tiras comida.',
  'Ancla resta lo que ya tienes (pollo, atun, res) antes de decirte que comprar.',
  'Hoy prioriza: res/molida + huevos + verdura + lacteos. Pollo solo el faltante.',
  'Suplementos = otro sobre. Orden: probioticos > proteina > creatina > omega.',
  'Mas adelante: Anthropic puede leer tu despensa y rearmar el carrito solo.',
]
