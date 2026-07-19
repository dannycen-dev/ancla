import type { Plan } from '../types'

export type ShopCategory =
  | 'proteinas'
  | 'lacteos'
  | 'frutas'
  | 'verduras'
  | 'panaderia'
  | 'despensa'
  | 'salsas'
  | 'snacks'
  | 'suplementos'

export type ShopItem = {
  id: string
  name: string
  qty: string
  category: ShopCategory
  note?: string
}

export const CATEGORY_LABELS: Record<ShopCategory, string> = {
  proteinas: 'Proteinas',
  lacteos: 'Lacteos / frio',
  frutas: 'Frutas',
  verduras: 'Verduras',
  panaderia: 'Pan / tortillas',
  despensa: 'Despensa',
  salsas: 'Salsas',
  snacks: 'Snacks opcionales',
  suplementos: 'Suplementos',
}

const CATEGORY_ORDER: ShopCategory[] = [
  'proteinas',
  'lacteos',
  'frutas',
  'verduras',
  'panaderia',
  'despensa',
  'salsas',
  'snacks',
  'suplementos',
]

/** Lista de super para ~7 dias del plan (cantidades orientativas). */
export function buildWeeklyShoppingList(plan: Plan): ShopItem[] {
  const text = plan.meals
    .flatMap((m) => m.items)
    .join(' | ')
    .toLowerCase()

  const has = (...needles: string[]) => needles.some((n) => text.includes(n.toLowerCase()))

  const items: ShopItem[] = []

  const add = (
    id: string,
    name: string,
    qty: string,
    category: ShopCategory,
    when: boolean,
    note?: string,
  ) => {
    if (when) items.push({ id, name, qty, category, note })
  }

  add('pollo', 'Pechuga de pollo', '1.2-1.5 kg', 'proteinas', has('pollo'), 'Almuerzo/cena principal')
  add('res', 'Carne de res magra / asada', '400-500 g', 'proteinas', has('res') || has('carne asada'), 'Burrito / wrap / burger')
  add('cerdo', 'Cerdo magro molido (opcional)', '200-300 g', 'proteinas', has('cerdo'))
  add('pescado', 'Pescado a la plancha (opcional)', '350-500 g', 'proteinas', has('pescado'), 'Sustituto de pollo')
  add('huevos', 'Huevos', '18-21 pzas', 'proteinas', has('huevo'))
  add('jamon', 'Jamon pechuga de pavo', '200-250 g', 'proteinas', has('jamon') || has('jam\u00f3n'))

  add('yogur', 'Yogurt griego sin azucar', '700 g', 'lacteos', has('yogurt') || has('yogur'))
  add('leche-lala', 'Leche LALA 100+ Proteina', '1-2 L', 'lacteos', has('lala'))
  add('leche-light', 'Leche light deslactosada', '1-2 L', 'lacteos', has('deslactosada') || has('leche light'))
  add('almendra', 'Leche de almendras', '1 L', 'lacteos', has('almendra'))
  add('crema', 'Media crema light', '1 pieza', 'lacteos', has('media crema'))

  add('manzana', 'Manzanas', '8-10 pzas', 'frutas', has('manzana'))
  add('platano', 'Platanos', '5-7 pzas', 'frutas', has('platano') || has('pl\u00e1tano'))
  add('fresa', 'Fresas', '500-700 g', 'frutas', has('fresa'))
  add('uva', 'Uvas', '400-500 g', 'frutas', has('uva'))
  add('melon', 'Melon', '1 pieza', 'frutas', has('melon') || has('mel\u00f3n'))
  add('sandia', 'Sandia', '1/2 pieza', 'frutas', has('sandia') || has('sand\u00eda'))
  add('fresa-cong', 'Fresas congeladas (opcional)', '1 bolsa', 'frutas', has('congelad'))

  add(
    'verduras',
    'Verduras mixtas (lechuga, jitomate, pepino, calabaza, espinaca)',
    'A voluntad / 1-1.5 kg',
    'verduras',
    has('verdura'),
    'Minimo 2 comidas verdes al dia',
  )
  add('aguacate', 'Aguacate', '3-4 pzas', 'verduras', has('aguacate'))

  add('maiz', 'Tortillas de maiz', '1 paquete', 'panaderia', has('ma\u00edz') || has('maiz'))
  add('tia-rosa', 'Tortillas Tia Rosa Parrillera', '1 paquete', 'panaderia', has('tia rosa') || has('t\u00eda rosa'))
  add('bimbo-doble', 'Pan Bimbo doble cero', '1 paquete', 'panaderia', has('doble cero') || has('pan doble'))
  add('bimbo-burger', 'Pan Bimbo cero hamburguesa', '1 paquete', 'panaderia', has('hamburguesa'))
  add('salmas', 'Salmas rectangulares', '1-2 paquetes', 'panaderia', has('salmas'))
  add('sanissimo', 'Tostadas Sanissimo', '1 paquete', 'panaderia', has('sanissimo') || has('tostada'))

  add('frijol', 'Frijoles bayos refritos', '2 latas / 400 g', 'despensa', has('frijol'))
  add('avena', 'Avena', '500 g', 'despensa', has('avena'))
  add('cornflakes', 'Corn flakes clasico', '1 caja chica', 'despensa', has('corn flakes') || has('cornflake'))
  add('crotones', 'Crotones', '1 bolsa', 'despensa', has('croton'))
  add('palomitas', 'Palomitas naturales', '1 bolsa (20 g por porcion)', 'snacks', has('palomita'))
  add('gelatina', 'Gelatina 0 calorias', '2-3 vasos / caja', 'snacks', has('gelatina'))
  add('turin', 'Chocolate Turin 0 calorias', '1 caja', 'snacks', has('turin') || has('tur\u00edn'))

  add('mister', 'Salsa Mister Taste', '1-2 botellas', 'salsas', has('mister taste'))
  add('salsa-verde', 'Salsa verde', '1 frasco', 'salsas', has('salsa verde'))
  add('salsa', 'Salsa al gusto (opcional extra)', '1 pieza', 'salsas', has('salsa al gusto'))

  for (const [i, s] of plan.profile.supplements.entries()) {
    add(`supp-${i}`, s, 'Segun indicacion', 'suplementos', true)
  }

  add(
    'cero',
    'Bebida cero calorias (Clight / Be light / Coca sin azucar)',
    'Para max 4 veces/semana',
    'despensa',
    true,
    'Opcional',
  )

  return items
}

export function groupShoppingList(items: ShopItem[]) {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0)
}

export function weekShoppingKey(d = new Date()) {
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  return start.toISOString().slice(0, 10)
}
