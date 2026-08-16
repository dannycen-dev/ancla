export const RM_PERCENTS = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const;

export const PLAN_PERCENTS = new Set([50, 60, 70, 80, 90]);

export function estimateOneRm(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  if (reps === 10) return Math.round(weightKg / 0.75);
  const denom = 1.0278 - 0.0278 * reps;
  if (denom <= 0) return null;
  return Math.round(weightKg / denom);
}

export function percentOfRm(oneRm: number, percent: number): number {
  return Math.round(oneRm * (percent / 100));
}
