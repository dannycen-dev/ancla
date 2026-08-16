import type { Plan } from "./plan.ts";
import { SEED_BUNDLES, SEED_PRODUCTS } from "./catalog.ts";
import { seedTraining } from "./seedTraining.ts";

export const seedPlan: Plan = {
  title: "Plan Dani",
  updatedAt: "2026-08-08T00:00:00.000Z",
  goals: [
    {
      id: "goal-1",
      title: "Recomposición corporal",
      body: "Ganar de forma eficiente todo el músculo posible, manteniendo bajo el tejido adiposo y el peso corporal normalizado.",
    },
    {
      id: "goal-2",
      title: "Adaptación alimenticia",
      body: "Ir adaptando progresivamente las calorías.",
    },
  ],
  cardio:
    "Realizar 35 minutos de cardio moderado de tu preferencia, 5 días a la semana.",
  extras: [],
  startedOn: "2026-08-16",
  consultOn: "2026-09-17",
  consultFeeMxn: 1000,
  products: SEED_PRODUCTS,
  bundles: SEED_BUNDLES,
  training: seedTraining,
  recommendations: [
    {
      id: "rec-2",
      text: "No saltarse ninguna comida.",
      highlight: null,
    },
    {
      id: "rec-3",
      text: "Si quieres alguna sustitución de equivalente, avisar al nutriólogo.",
      highlight: null,
    },
    {
      id: "rec-4",
      text: "Evitar refrescos embotellados, alcohol, jugos o bebidas azucaradas.",
      highlight: null,
    },
    {
      id: "rec-5",
      text: "Los alimentos se pueden preparar y sazonar al gusto.",
      highlight: null,
    },
    {
      id: "rec-7",
      text: "No consumir comidas adicionales a los platillos de la dieta.",
      highlight: null,
    },
    {
      id: "rec-9",
      text: "No añadir comidas extra a las indicadas en el menú.",
      highlight: null,
    },
    {
      id: "rec-10",
      text: "Si eventualmente consumes otra suplementación, avisar al nutriólogo.",
      highlight: null,
    },
    {
      id: "rec-11",
      text: "Los alimentos irritantes o que te caigan mal se pueden omitir, o pedir una sustitución al nutriólogo.",
      highlight: null,
    },
  ],
  schedule: [
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
  ],
  meals: [
    {
      id: "colacion-1",
      name: "Colación 1",
      kcal: 150,
      options: [
        {
          id: "colacion-1-fruta",
          title: "Fruta con yogurt griego",
          tone: "green",
          items: [
            "2 manzanas picadas, o 1 plátano, o 5 fresas, o 10 uvas, o 60 g de melón, o 50 g de sandía (si quieres otra fruta, avisar al nutriólogo)",
            "250 g de yogurt griego Oikos sin azúcar",
          ],
        },
      ],
    },
    {
      id: "colacion-2",
      name: "Colación 2",
      kcal: null,
      options: [
        {
          id: "colacion-2-rice",
          title: "Rice cakes",
          tone: "muted",
          items: [
            "1 rice cake",
            "2 cdas de mermelada 0 azúcar por cada una",
            "2 cdas de queso Philadelphia por cada una",
          ],
        },
      ],
    },
    {
      id: "desayuno",
      name: "Desayuno",
      kcal: 350,
      options: [
        {
          id: "desayuno-huevo",
          title: "Huevo a la mexicana",
          tone: "green",
          items: [
            "1 huevo y 1 clara",
            "20 g de jamón de pechuga de pavo",
            "½ tomate rebanado",
            "20 g de verdura al gusto",
            "1 tortilla",
          ],
        },
        {
          id: "desayuno-burritas",
          title: "Burritas",
          tone: "amber",
          items: [
            "40 g de queso Oaxaca",
            "2 tortillas Tía Rosa integrales",
            "30 g de pollo deshebrado o 2 huevos estrellados",
            "Pico de gallo al gusto",
          ],
        },
        {
          id: "desayuno-tostadas",
          title: "Tostadas francesas",
          tone: "amber",
          items: [
            "1 huevo y 1 clara",
            "½ scoop de proteína",
            "2 rebanadas de pan Bimbo",
            "250 ml de leche deslactosada light",
            "1 taza de fresas",
            "Miel Dgary sin azúcar al gusto",
          ],
        },
        {
          id: "desayuno-chilaquiles",
          title: "Chilaquiles",
          tone: "amber",
          items: [
            "30 g de pollo deshebrado",
            "2 paquetes de tostadas Saníssimo",
            "Salsa verde Herdez al gusto",
            "1 cda de media crema light",
            "40 g de queso Oaxaca",
          ],
        },
      ],
    },
    {
      id: "colacion-3",
      name: "Colación 3",
      kcal: 120,
      options: [
        {
          id: "colacion-3-batido",
          title: "Batido",
          tone: "muted",
          items: [
            "150 ml de leche Lala 100 + proteína, o Silk de almendra",
            "1 scoop de proteína",
            "1 scoop de creatina monohidratada",
            "Agua y hielos al gusto",
          ],
        },
      ],
    },
    {
      id: "almuerzo",
      name: "Almuerzo",
      kcal: 450,
      options: [
        {
          id: "almuerzo-tacos",
          title: "Tacos de carne asada",
          tone: "green",
          items: [
            "80 g de carne asada",
            "100 g de verduras picadas, sazonadas al gusto",
            "Salsa al gusto",
            "80 g de queso Oaxaca",
            "2 tortillas de maíz",
          ],
        },
        {
          id: "almuerzo-basico-1",
          title: "Platillo básico",
          tone: "green",
          items: [
            "100 g de pollo deshebrado o a la plancha, o 80 g de arrachera",
            "50 g de arroz blanco",
            "80 g de verduras al gusto",
            "Soya al gusto",
            "Guacamole: ½ aguacate, 1 limón exprimido, cebolla y tomate al gusto",
          ],
        },
        {
          id: "almuerzo-basico-2",
          title: "Platillo básico",
          tone: "amber",
          items: [
            "100 g de pescado a la plancha, o 80 g de carne molida de cerdo",
            "50 g de frijoles bayos refritos",
            "80 g de verduras al gusto",
            "Guacamole: ½ aguacate, 1 limón exprimido, cebolla y tomate al gusto",
          ],
        },
        {
          id: "almuerzo-enchiladas",
          title: "Enchiladas suizas",
          tone: "amber",
          items: [
            "100 g de pollo deshebrado o a la plancha",
            "3 tortillas de harina Misión ligeras",
            "2 cdas de media crema light",
            "Salsa al gusto",
            "2 hojas de lechuga romana",
            "1 rebanada de queso manchego",
          ],
        },
      ],
    },
    {
      id: "cena",
      name: "Cena",
      kcal: 350,
      options: [
        {
          id: "cena-motulenos",
          title: "Huevos motuleños",
          tone: "green",
          items: [
            "2 salmas rectangulares",
            "100 g de frijoles bayos refritos",
            "1 huevo estrellado",
            "Salsa al gusto",
            "Verduras al gusto",
          ],
        },
        {
          id: "cena-sandwich",
          title: "Sándwich",
          tone: "amber",
          items: [
            "2 rebanadas de pan Bimbo Doble Cero",
            "2 rebanadas de jamón de pechuga de pavo",
            "1 rebanada de queso manchego",
            "Verduras al gusto",
            "30 g de pollo",
          ],
        },
        {
          id: "cena-hotcakes",
          title: "Hot cakes",
          tone: "green",
          items: [
            "50 g de harina de almendra Morama",
            "2 cdas de vainilla",
            "1 huevo",
            "100 ml de leche de almendras",
            "½ plátano",
            "20 g de yogurt griego Oikos sin azúcar",
          ],
        },
        {
          id: "cena-cereal",
          title: "Cereal con proteína",
          tone: "red",
          items: [
            "200 ml de leche de coco o de almendra",
            "1 scoop de proteína",
            "30 g de Cheerios clásico",
            "1 plátano",
            "Agua y hielos al gusto",
          ],
        },
      ],
    },
  ],
};
