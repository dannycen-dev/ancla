import type { PayPeriod } from "./period.ts";
import type { MealTone, Plan } from "./plan.ts";
import { eachDate, variationIndex, weekdayFromISO } from "./schedule.ts";

export type GroceryCategory =
  | "proteinas"
  | "lacteos"
  | "fruta-verdura"
  | "carbos"
  | "despensa"
  | "suplementos";

export type GroceryItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  category: GroceryCategory;
  note: string;
};

export type GroceryChoice = {
  id: string;
  title: string;
  times: number;
  options: string[];
};

export type MealCount = {
  meal: string;
  option: string;
  optionId: string;
  tone: MealTone;
  times: number;
};

export type GroceryList = {
  items: GroceryItem[];
  choices: GroceryChoice[];
  meals: MealCount[];
  days: number;
};

export const CATEGORY_ORDER: GroceryCategory[] = [
  "proteinas",
  "lacteos",
  "fruta-verdura",
  "carbos",
  "despensa",
  "suplementos",
];

const CATEGORY_LABEL: Record<GroceryCategory, string> = {
  proteinas: "Proteínas",
  lacteos: "Lácteos",
  "fruta-verdura": "Fruta y verdura",
  carbos: "Carbohidratos",
  despensa: "Despensa",
  suplementos: "Suplementos",
};

export function categoryLabel(category: GroceryCategory): string {
  return CATEGORY_LABEL[category];
}

const SKIP = /^agua y hielos/i;

export function buildGrocery(plan: Plan, period: PayPeriod): GroceryList {
  const dates = eachDate(period.start, period.end);
  const qty = new Map<string, GroceryItem>();
  const choices = new Map<string, GroceryChoice>();
  const meals = new Map<string, MealCount>();

  function addItem(name: string, amount: number, unit: string, note = "") {
    const clean = canonicalize(normalizeName(name));
    if (!clean || SKIP.test(clean)) return;
    const id = `${unit}::${clean}`;
    const current = qty.get(id);
    if (current) {
      current.qty += amount;
      return;
    }
    qty.set(id, {
      id,
      name: clean,
      qty: amount,
      unit,
      category: categorize(clean, unit),
      note,
    });
  }

  function addChoice(title: string, options: string[]) {
    const id = `choice::${options.join("|").toLowerCase()}`;
    const current = choices.get(id);
    if (current) {
      current.times += 1;
      return;
    }
    choices.set(id, { id, title, times: 1, options });
  }

  for (const date of dates) {
    const jsDay = weekdayFromISO(date);
    for (const slot of plan.schedule) {
      if (slot.kind === "supplement") {
        if (/probió/i.test(slot.title)) addItem("probióticos (cápsulas)", 2, "pza");
        continue;
      }
      if (/omega-3/i.test(slot.detail)) addItem("omega-3 (cápsulas)", 2, "pza");
      if (!slot.mealId) continue;
      const meal = plan.meals.find((item) => item.id === slot.mealId);
      if (!meal || meal.options.length === 0) continue;
      const option = meal.options[variationIndex(jsDay, meal.options.length)];
      if (!option) continue;
      const mealKey = option.id;
      const counted = meals.get(mealKey);
      if (counted) counted.times += 1;
      else {
        meals.set(mealKey, {
          meal: meal.name,
          option: optionLabel(meal, option.title, option.tone),
          optionId: option.id,
          tone: option.tone,
          times: 1,
        });
      }
      for (const line of option.items) parseLine(line, addItem, addChoice);
    }
  }

  const items = [...qty.values()]
    .map((item) => ({ ...item, qty: roundQty(item.qty) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return {
    items,
    choices: [...choices.values()].sort((a, b) => b.times - a.times),
    meals: [...meals.values()].sort((a, b) => b.times - a.times || a.meal.localeCompare(b.meal, "es")),
    days: dates.length,
  };
}

export function formatQty(item: GroceryItem): string {
  if (item.unit === "g" && item.qty >= 1000) return `${trimNum(item.qty / 1000)} kg`;
  if (item.unit === "ml" && item.qty >= 1000) return `${trimNum(item.qty / 1000)} L`;
  if (item.unit === "uso") return `al gusto × ${trimNum(item.qty)}`;
  if (item.unit === "taza") return `${trimNum(item.qty)} ${item.qty === 1 ? "taza" : "tazas"}`;
  const unit = item.unit === "scoop" && item.qty !== 1 ? "scoops" : item.unit;
  return `${trimNum(item.qty)} ${unit}`;
}

function parseLine(
  line: string,
  addItem: (name: string, amount: number, unit: string, note?: string) => void,
  addChoice: (title: string, options: string[]) => void,
) {
  const text = line
    .replaceAll("½", "0.5")
    .replaceAll("¼", "0.25")
    .replaceAll("¾", "0.75")
    .replace(/\s*\(si quieres otra fruta.*?\)/i, "")
    .trim();
  if (!text || SKIP.test(text)) return;

  if (/^guacamole:/i.test(text)) {
    addItem("aguacate", 0.5, "pza");
    addItem("limón", 1, "pza");
    addItem("cebolla", 0.3, "pza");
    addItem("tomate", 0.5, "pza");
    return;
  }

  const alternatives = splitOr(text);
  if (alternatives.length > 1) {
    addChoice(choiceTitle(alternatives), alternatives);
    return;
  }

  if (/huevo y .*clara/i.test(text)) {
    addItem("huevo", 1, "pza");
    addItem("clara de huevo", 1, "pza");
    return;
  }

  const parsed = matchQty(text);
  if (parsed) {
    addItem(parsed.name, parsed.qty, parsed.unit);
    return;
  }

  if (/al gusto/i.test(text)) {
    addItem(text.replace(/\s+al gusto\.?/i, ""), 1, "uso");
    return;
  }

  addItem(text, 1, "uso");
}

function optionLabel(meal: Plan["meals"][number], title: string, tone: MealTone): string {
  const sameTitle = meal.options.filter((item) => item.title === title).length > 1;
  if (!sameTitle) return title;
  const toneName: Record<MealTone, string> = {
    green: "verde",
    amber: "ámbar",
    red: "rojo",
    muted: "fijo",
  };
  return `${title} (${toneName[tone]})`;
}

function canonicalize(name: string): string {
  if (/^pollo/.test(name)) return "pollo";
  if (/^jamón de pechuga de pavo/.test(name)) return "jamón de pechuga de pavo";
  if (/^leche de coco|^leche de almendra/.test(name)) return "leche de almendra o coco";
  return name;
}

function splitOr(text: string): string[] {
  if (/,\s*o\s+/i.test(text)) {
    return text.split(/\s*,\s*o\s+/i).map(cleanPart).filter(Boolean);
  }
  const parts = text.split(/\so\s+(?=\d)/i).map(cleanPart).filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

function cleanPart(part: string): string {
  return part.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function choiceTitle(options: string[]): string {
  const joined = options.join(" ").toLowerCase();
  if (/manzana|plátano|fresa|uva|melón|sandía/.test(joined) && options.length >= 3) {
    return "Fruta de la colación 1";
  }
  if (/pollo|arrachera|carne|pescado|cerdo|huevo/.test(joined)) {
    return "Proteína a elegir";
  }
  if (/leche|silk|almendra|coco/.test(joined)) {
    return "Leche a elegir";
  }
  return options[0]?.slice(0, 42) || "Opción a elegir";
}

function matchQty(text: string): { qty: number; unit: string; name: string } | null {
  const patterns: [RegExp, string][] = [
    [/^(\d+(?:\.\d+)?)\s*g(?:r|s)?(?:amos?)?\s+de\s+(.+)/i, "g"],
    [/^(\d+(?:\.\d+)?)\s*ml\s+de\s+(.+)/i, "ml"],
    [/^(\d+(?:\.\d+)?)\s*cdas?\s+de\s+(.+)/i, "cdas"],
    [/^(\d+(?:\.\d+)?)\s*cda\s+de\s+(.+)/i, "cdas"],
    [/^(\d+(?:\.\d+)?)\s*rebanadas?\s+de\s+(.+)/i, "pza"],
    [/^(\d+(?:\.\d+)?)\s*scoop(?:s)?\s+de\s+(.+)/i, "scoop"],
    [/^(\d+(?:\.\d+)?)\s*paquetes?\s+de\s+(.+)/i, "pza"],
    [/^(\d+(?:\.\d+)?)\s*tazas?\s+de\s+(.+)/i, "taza"],
    [/^(\d+(?:\.\d+)?)\s*hojas?\s+de\s+(.+)/i, "pza"],
    [/^(\d+(?:\.\d+)?)\s+(.+)/i, "pza"],
  ];
  for (const [pattern, unit] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const qty = Number(match[1]);
    const name = match[2] ?? "";
    if (!Number.isFinite(qty) || !name) continue;
    return { qty, unit, name };
  }
  return null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\bpor cada una\b/g, "")
    .replace(/\s+al gusto\b/g, "")
    .replace(/\bpicas?das?\b|\brebanad[oa]s?\b|\bestrellad[oa]s?\b|\s+sazonadas\b/g, "")
    .replace(/\bverduras\b/g, "verdura")
    .replace(/\s+/g, " ")
    .replace(/[.,]$/g, "")
    .trim();
}

function categorize(name: string, unit: string): GroceryCategory {
  if (unit === "scoop" || /omega|probióticos|creatina|^proteína$/.test(name)) return "suplementos";
  if (/huevo|clara|pollo|carne|pavo|jamón|pescado|cerdo|arrachera/.test(name)) return "proteinas";
  if (/yogurt|queso|leche|philadelphia|crema/.test(name)) return "lacteos";
  if (
    /manzana|plátano|fresa|uva|melón|sandía|aguacate|tomate|verdura|lechuga|limón|cebolla|pico de gallo/.test(
      name,
    )
  ) {
    return "fruta-verdura";
  }
  if (/tortilla|pan|arroz|tostada|rice|salma|harina|cheerio/.test(name)) return "carbos";
  return "despensa";
}

function roundQty(value: number): number {
  return Math.round(value * 10) / 10;
}

function trimNum(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
