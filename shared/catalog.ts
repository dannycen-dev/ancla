import type { GroceryItem, GroceryList } from "./grocery.ts";
import { buildGrocery } from "./grocery.ts";
import { isDateKey } from "./log.ts";
import type { PayPeriod } from "./period.ts";
import type { Plan } from "./plan.ts";
import { addDays, eachDate, formatDayLong } from "./schedule.ts";

export type MeasureUnit = "g" | "ml" | "pza" | "scoop";

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string;
  store: string;
  match: string[];
  packQty: number;
  packUnit: MeasureUnit;
  packLabel: string;
  servingQty: number | null;
  servingUnit: MeasureUnit | null;
  servings: number | null;
  priceMxn: number | null;
  bundleId: string | null;
  openedOn: string | null;
  note: string;
};

export type CatalogBundle = {
  id: string;
  name: string;
  priceMxn: number;
};

export type ProductCoverage = {
  product: CatalogProduct;
  item: GroceryItem | null;
  need: number;
  packSize: number;
  packs: number;
  leftover: number;
  daysOnePack: number | null;
  runOutOnePack: string | null;
  daysBought: number | null;
  runOutBought: string | null;
  periodCost: number | null;
  dailyLabel: string;
  needLabel: string;
};

export const SEED_BUNDLES: CatalogBundle[] = [
  {
    id: "proteina-creatina",
    name: "Proteína + creatina",
    priceMxn: 1050,
  },
];

export const SEED_PRODUCTS: CatalogProduct[] = [
  {
    id: "yogurt-oikos",
    name: "Yoghurt griego natural sin azúcar",
    brand: "Oikos",
    store: "Sam's Club",
    match: ["yogurt griego oikos"],
    packQty: 1800,
    packUnit: "g",
    packLabel: "2 botes de 900 g",
    servingQty: null,
    servingUnit: null,
    servings: null,
    priceMxn: 186.18,
    bundleId: null,
    openedOn: null,
    note: "",
  },
  {
    id: "proteina",
    name: "Proteína en polvo",
    brand: "",
    store: "",
    match: ["proteína"],
    packQty: 1000,
    packUnit: "g",
    packLabel: "1 kg",
    servingQty: 30,
    servingUnit: "g",
    servings: 33,
    priceMxn: 650,
    bundleId: null,
    openedOn: "2026-08-16",
    note: "Promo del kit: $1,050 = $650 proteína + $400 creatina. Este bote se acaba primero; la próxima recarga es $650.",
  },
  {
    id: "creatina",
    name: "Creatina monohidratada",
    brand: "",
    store: "",
    match: ["creatina"],
    packQty: 300,
    packUnit: "g",
    packLabel: "300 g",
    servingQty: 5,
    servingUnit: "g",
    servings: 60,
    priceMxn: 400,
    bundleId: null,
    openedOn: "2026-08-16",
    note: "En el kit equivalía a $400. Dura más que la proteína; la recarga va por su lado, a $400.",
  },
  {
    id: "verdura-california",
    name: "Mezcla California (brócoli, coliflor y zanahoria)",
    brand: "Member's Mark",
    store: "Sam's Club",
    match: ["verdura"],
    packQty: 2500,
    packUnit: "g",
    packLabel: "2.5 kg",
    servingQty: 80,
    servingUnit: "g",
    servings: null,
    priceMxn: 165.72,
    bundleId: null,
    openedOn: null,
    note: "Para verduras al gusto y las que van en gramos. Las de al gusto las cuento a 80 g, como en el almuerzo.",
  },
];

export function emptyProduct(): CatalogProduct {
  return {
    id: crypto.randomUUID(),
    name: "Producto",
    brand: "",
    store: "",
    match: [],
    packQty: 1,
    packUnit: "g",
    packLabel: "",
    servingQty: null,
    servingUnit: "g",
    servings: null,
    priceMxn: null,
    bundleId: null,
    openedOn: null,
    note: "",
  };
}

export function isProduct(value: unknown): value is CatalogProduct {
  if (value === null || typeof value !== "object") return false;
  const item = value as Partial<CatalogProduct>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.brand === "string" &&
    typeof item.store === "string" &&
    Array.isArray(item.match) &&
    item.match.every((token) => typeof token === "string") &&
    typeof item.packQty === "number" &&
    typeof item.packLabel === "string" &&
    (item.priceMxn === null || typeof item.priceMxn === "number") &&
    (item.bundleId === null || typeof item.bundleId === "string")
  );
}

function coerceProduct(item: CatalogProduct): CatalogProduct {
  return {
    ...item,
    openedOn: typeof item.openedOn === "string" && isDateKey(item.openedOn) ? item.openedOn : null,
    note: typeof item.note === "string" ? item.note : "",
  };
}

function refreshSeedProduct(stored: CatalogProduct, seed: CatalogProduct): CatalogProduct {
  const current = coerceProduct(stored);
  if (stored.id === "proteina") {
    const stillKit = stored.bundleId === "proteina-creatina" || stored.priceMxn == null;
    return {
      ...current,
      priceMxn: stillKit ? 650 : current.priceMxn,
      bundleId: null,
      openedOn: current.openedOn ?? seed.openedOn,
      note: current.note.includes("$650") ? current.note : seed.note,
    };
  }
  if (stored.id === "creatina") {
    const stillUnset = stored.priceMxn == null;
    return {
      ...current,
      priceMxn: stillUnset ? 400 : current.priceMxn,
      bundleId: null,
      openedOn: current.openedOn ?? seed.openedOn,
      note: current.note.includes("$400") ? current.note : seed.note,
    };
  }
  return current;
}

export function isBundle(value: unknown): value is CatalogBundle {
  if (value === null || typeof value !== "object") return false;
  const item = value as Partial<CatalogBundle>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.priceMxn === "number";
}

export function mergeCatalog(stored: {
  products?: unknown;
  bundles?: unknown;
}): { products: CatalogProduct[]; bundles: CatalogBundle[] } {
  const products = Array.isArray(stored.products) ? stored.products.filter(isProduct).map(coerceProduct) : [];
  const bundles = Array.isArray(stored.bundles) ? stored.bundles.filter(isBundle) : [];
  for (const seed of SEED_PRODUCTS) {
    const index = products.findIndex((item) => item.id === seed.id);
    if (index === -1) products.push(seed);
    else products[index] = refreshSeedProduct(products[index], seed);
  }
  for (const seed of SEED_BUNDLES) {
    if (!bundles.some((item) => item.id === seed.id)) bundles.push(seed);
  }
  return { products, bundles };
}

export function productMatches(product: CatalogProduct, item: GroceryItem): boolean {
  return product.match.some((token) => token.length > 0 && item.name.includes(token.toLowerCase()));
}

export function coveredItemIds(list: GroceryList, products: CatalogProduct[]): Set<string> {
  const ids = new Set<string>();
  for (const product of products) {
    for (const item of matchingItems(list, product)) ids.add(item.id);
  }
  return ids;
}

export function coverProducts(
  list: GroceryList,
  products: CatalogProduct[],
  period: PayPeriod,
  plan: Plan,
): ProductCoverage[] {
  return products
    .map((product) => coverProduct(list, product, period, plan))
    .filter((item) => item.item !== null || item.product.priceMxn != null || Boolean(item.product.note));
}

function coverProduct(
  list: GroceryList,
  product: CatalogProduct,
  period: PayPeriod,
  plan: Plan,
): ProductCoverage {
  const items = matchingItems(list, product);
  const item = items[0] ?? null;
  const packSize = product.servings && product.servings > 0 ? product.servings : product.packQty;
  const need = items.reduce((sum, entry) => sum + usageNeed(product, entry), 0);
  const daily = period.days > 0 && need > 0 ? need / period.days : 0;
  const openedOn = product.openedOn;
  let remaining = 0;
  let packs = 0;
  let runOut: string | null = daily > 0 ? runOutDate(openedOn ?? period.start, packSize / daily) : null;

  if (need > 0 && openedOn) {
    const stock = walkPack(plan, product, packSize, openedOn, period.start);
    remaining = stock.remaining;
    runOut = stock.runOut;
    const shortfall = Math.max(0, need - remaining);
    packs = shortfall > 0 ? Math.ceil(shortfall / packSize) : 0;
  } else if (need > 0) {
    packs = Math.max(1, Math.ceil(need / packSize));
  }

  const leftover = remaining + packs * packSize - need;
  const daysOnePack = daily > 0 ? packSize / daily : null;
  const origin = openedOn ?? period.start;
  const daysBought = daily > 0 && remaining + packs * packSize > 0 ? (remaining + packs * packSize) / daily : null;

  return {
    product,
    item,
    need,
    packSize,
    packs,
    leftover,
    daysOnePack,
    runOutOnePack: runOut,
    daysBought,
    runOutBought: daysBought != null ? runOutDate(origin, daysBought) : null,
    periodCost: product.priceMxn != null && packs > 0 ? product.priceMxn * packs : null,
    dailyLabel: daily > 0 ? `${trimNum(daily)} ${needUnit(product, item, daily)} / día` : "Esta quincena no lo usas",
    needLabel: needLabel(product, item, need),
  };
}

export function periodSpend(coverages: ProductCoverage[], checkedIds: string[]): number {
  let total = 0;
  for (const coverage of coverages) {
    if (coverage.packs <= 0) continue;
    if (checkedIds.includes(coverage.product.id)) continue;
    if (coverage.periodCost != null) total += coverage.periodCost;
  }
  return total;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatDays(days: number): string {
  const rounded = Math.round(days);
  return rounded === 1 ? "1 día" : `${rounded} días`;
}

export function formatRunOut(dateStr: string): string {
  return formatDayLong(dateStr);
}

function matchingItems(list: GroceryList, product: CatalogProduct): GroceryItem[] {
  return list.items.filter((entry) => productMatches(product, entry));
}

function usageNeed(product: CatalogProduct, item: GroceryItem): number {
  if (item.unit === "uso" && product.servingQty && (product.packUnit === "g" || product.servingUnit === "g")) {
    return item.qty * product.servingQty;
  }
  if (product.servings && product.servingQty) {
    if (item.unit === "scoop" || item.unit === "pza") return item.qty;
    if (item.unit === "g" && (product.servingUnit === "g" || product.packUnit === "g")) {
      return item.qty / product.servingQty;
    }
  }
  return item.qty;
}

function needUnit(product: CatalogProduct, item: GroceryItem | null, qty = 0): string {
  if (product.servings) return qty === 1 ? "porción" : "porciones";
  if (item?.unit === "g") return "g";
  if (item?.unit === "ml") return "ml";
  return product.packUnit;
}

function needLabel(product: CatalogProduct, item: GroceryItem | null, need: number): string {
  if (need <= 0) return "No entra en esta quincena";
  if (product.servings && product.servingQty) {
    const grams = need * product.servingQty;
    return `${trimNum(need)} porciones · ${formatWeight(grams)} de ${formatWeight(product.packQty)}`;
  }
  if (item?.unit === "g" || product.packUnit === "g") {
    return `${formatWeight(need)} de ${product.packLabel}`;
  }
  return `${trimNum(need)} ${needUnit(product, item)}`;
}

function walkPack(
  plan: Plan,
  product: CatalogProduct,
  packSize: number,
  openedOn: string,
  untilDate: string,
): { remaining: number; runOut: string | null } {
  let left = packSize;
  let runOut: string | null = null;

  if (openedOn < untilDate) {
    for (const day of eachDate(openedOn, addDays(untilDate, -1))) {
      left -= dayNeed(plan, product, day);
      if (left <= 0) return { remaining: 0, runOut: runOut ?? day };
    }
  }

  const remaining = Math.max(0, left);
  let cursor = untilDate > openedOn ? untilDate : openedOn;
  for (let step = 0; step < 400 && left > 0; step++) {
    left -= dayNeed(plan, product, cursor);
    if (left <= 0) {
      runOut = cursor;
      break;
    }
    cursor = addDays(cursor, 1);
  }
  return { remaining, runOut };
}

function dayNeed(plan: Plan, product: CatalogProduct, date: string): number {
  const list = buildGrocery(plan, {
    id: date,
    start: date,
    end: date,
    payday: date,
    payLabel: "",
    days: 1,
  });
  return matchingItems(list, product).reduce((sum, entry) => sum + usageNeed(product, entry), 0);
}

function runOutDate(from: string, days: number): string {
  const last = Math.max(0, Math.floor(days) - 1);
  return addDays(from, last);
}

function formatWeight(grams: number): string {
  if (grams >= 1000) return `${trimNum(grams / 1000)} kg`;
  return `${trimNum(grams)} g`;
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, "");
}
