export const RM_PERCENTS = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const;

export const PLAN_PERCENTS = new Set([50, 60, 70, 80, 90]);

export const KG_PER_LB = 0.45359237;

export type WeightUnit = "kg" | "lb";

/** Brzycki (1993), la misma que usa Soy Powerlifter. Fiable sobre todo entre 1 y 10 reps. */
export function estimateOneRm(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  return Math.round(weightKg * (36 / (37 - reps)));
}

export function estimateOneRmLoose(weightKg: number, reps: number): number | null {
  const strict = estimateOneRm(weightKg, reps);
  if (strict != null) return strict;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 11 || reps > 21) return null;
  if (reps <= 12) return Math.round(weightKg * (36 / (37 - reps)));
  if (reps <= 15) return Math.round(weightKg / 0.7);
  return Math.round(weightKg / 0.5);
}

export function brzyckiLoad(oneRm: number, reps: number): number {
  const count = Math.max(1, Math.min(12, Math.round(reps)));
  return oneRm * ((37 - count) / 36);
}

export function percentOfRm(oneRm: number, percent: number): number {
  return Math.round(oneRm * (percent / 100));
}

export function toKg(weight: number, unit: WeightUnit): number {
  return unit === "lb" ? weight * KG_PER_LB : weight;
}

export function parseWeight(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  if (unit === "lb") {
    const rounded = Math.round(kg / KG_PER_LB / 2.5) * 2.5;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  const rounded = kg >= 20 ? Math.round(kg) : Math.round(kg * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatLoadLabel(kg: number, unit: WeightUnit): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}
