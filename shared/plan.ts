import { mergeCatalog, type CatalogBundle, type CatalogProduct } from "./catalog.ts";
import { isDateKey } from "./log.ts";
import { seedTraining } from "./seedTraining.ts";
import { isTrainingPlan, normalizeTraining, type TrainingPlan } from "./training.ts";

export type MealTone = "green" | "amber" | "red" | "muted";

export type Highlight = "warn" | "ok" | null;

export type MealOption = {
  id: string;
  title: string;
  tone: MealTone;
  items: string[];
};

export type Meal = {
  id: string;
  name: string;
  kcal: number | null;
  options: MealOption[];
};

export type SlotKind = "meal" | "supplement";

export type ScheduleSlot = {
  id: string;
  time: string;
  title: string;
  kind: SlotKind;
  mealId: string | null;
  detail: string;
};

export type Goal = {
  id: string;
  title: string;
  body: string;
};

export type Recommendation = {
  id: string;
  text: string;
  highlight: Highlight;
};

export type Plan = {
  title: string;
  updatedAt: string;
  goals: Goal[];
  recommendations: Recommendation[];
  cardio: string;
  extras: string[];
  meals: Meal[];
  schedule: ScheduleSlot[];
  startedOn: string;
  consultOn: string;
  consultFeeMxn: number;
  products: CatalogProduct[];
  bundles: CatalogBundle[];
  training: TrainingPlan;
};

export function emptyOption(): MealOption {
  return {
    id: crypto.randomUUID(),
    title: "Nueva opción",
    tone: "muted",
    items: [""],
  };
}

export function emptyMeal(): Meal {
  return {
    id: crypto.randomUUID(),
    name: "Nueva comida",
    kcal: null,
    options: [emptyOption()],
  };
}

export function emptyGoal(): Goal {
  return {
    id: crypto.randomUUID(),
    title: "Objetivo",
    body: "",
  };
}

export function emptyRecommendation(): Recommendation {
  return {
    id: crypto.randomUUID(),
    text: "",
    highlight: null,
  };
}

export function emptySlot(): ScheduleSlot {
  return {
    id: crypto.randomUUID(),
    time: "12:00",
    title: "Nuevo horario",
    kind: "supplement",
    mealId: null,
    detail: "",
  };
}

export function defaultSchedule(): ScheduleSlot[] {
  return [
    {
      id: "slot-probioticos",
      time: "07:00",
      title: "Probióticos",
      kind: "supplement",
      mealId: null,
      detail: "2 cápsulas, estómago vacío, justo antes del desayuno.",
    },
    {
      id: "slot-desayuno",
      time: "07:15",
      title: "Desayuno",
      kind: "meal",
      mealId: "desayuno",
      detail: "Con esta comida: 2 cápsulas de omega-3 (se absorben mejor con grasa).",
    },
    {
      id: "slot-colacion-1",
      time: "10:00",
      title: "Colación 1",
      kind: "meal",
      mealId: "colacion-1",
      detail: "",
    },
    {
      id: "slot-colacion-2",
      time: "12:00",
      title: "Colación 2",
      kind: "meal",
      mealId: "colacion-2",
      detail: "",
    },
    {
      id: "slot-almuerzo",
      time: "14:00",
      title: "Almuerzo",
      kind: "meal",
      mealId: "almuerzo",
      detail: "",
    },
    {
      id: "slot-colacion-3",
      time: "17:00",
      title: "Colación 3",
      kind: "meal",
      mealId: "colacion-3",
      detail: "Batido con proteína y creatina.",
    },
    {
      id: "slot-cena",
      time: "20:30",
      title: "Cena",
      kind: "meal",
      mealId: "cena",
      detail: "",
    },
  ];
}

function isScheduleSlot(value: unknown): value is ScheduleSlot {
  if (value === null || typeof value !== "object") return false;
  const slot = value as Partial<ScheduleSlot>;
  return (
    typeof slot.id === "string" &&
    typeof slot.time === "string" &&
    typeof slot.title === "string" &&
    (slot.kind === "meal" || slot.kind === "supplement") &&
    (slot.mealId === null || typeof slot.mealId === "string") &&
    typeof slot.detail === "string"
  );
}

export function isPlan(value: unknown): value is StoredPlan {
  if (value === null || typeof value !== "object") return false;
  const plan = value as Partial<StoredPlan>;
  const scheduleOk =
    plan.schedule === undefined ||
    (Array.isArray(plan.schedule) && plan.schedule.every(isScheduleSlot));
  return (
    typeof plan.title === "string" &&
    typeof plan.updatedAt === "string" &&
    Array.isArray(plan.goals) &&
    Array.isArray(plan.recommendations) &&
    typeof plan.cardio === "string" &&
    Array.isArray(plan.extras) &&
    Array.isArray(plan.meals) &&
    scheduleOk
  );
}

export type StoredPlan = Omit<
  Plan,
  "schedule" | "startedOn" | "consultOn" | "consultFeeMxn" | "products" | "bundles" | "training"
> & {
  schedule?: ScheduleSlot[];
  startedOn?: string;
  consultOn?: string;
  consultFeeMxn?: number;
  products?: CatalogProduct[];
  bundles?: CatalogBundle[];
  training?: TrainingPlan;
};

const DEFAULT_STARTED_ON = "2026-08-16";
const DEFAULT_CONSULT_ON = "2026-09-17";
const DEFAULT_CONSULT_FEE = 1000;
export const CONSULT_EXPENSE_ID = "consulta";

const MOVED_REC_IDS = new Set(["rec-1", "rec-6", "rec-8", "rec-12", "rec-13"]);

export function normalizePlan(plan: StoredPlan): Plan {
  const schedule = plan.schedule && plan.schedule.length > 0 ? plan.schedule : defaultSchedule();
  const catalog = mergeCatalog(plan);
  const training =
    plan.training && isTrainingPlan(plan.training)
      ? normalizeTraining(plan.training, seedTraining)
      : seedTraining;
  return {
    ...plan,
    schedule,
    training,
    products: catalog.products,
    bundles: catalog.bundles,
    startedOn: typeof plan.startedOn === "string" && isDateKey(plan.startedOn) ? plan.startedOn : DEFAULT_STARTED_ON,
    consultOn: typeof plan.consultOn === "string" && isDateKey(plan.consultOn) ? plan.consultOn : DEFAULT_CONSULT_ON,
    consultFeeMxn:
      typeof plan.consultFeeMxn === "number" && Number.isFinite(plan.consultFeeMxn) && plan.consultFeeMxn >= 0
        ? plan.consultFeeMxn
        : DEFAULT_CONSULT_FEE,
    recommendations: plan.recommendations.filter(
      (item) =>
        !MOVED_REC_IDS.has(item.id) &&
        !/omega-3|probiót|3\.5 litros|comidas marcadas en verde|comidas libres/i.test(item.text),
    ),
    extras: plan.extras.filter((text) => !/cero calor|Clight/i.test(text)),
  };
}
