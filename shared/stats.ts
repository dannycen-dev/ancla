import { formatWeight, parseWeight, toKg } from "./rm.ts";
import { estimateRmFromSets, inferSystemId, rolesForSlots } from "./setCoach.ts";
import {
  loadHasData,
  parseSetSlots,
  setsForSlots,
  weekIndex,
  type ExerciseLoad,
  type RmEntry,
  type TrainingLoads,
  type TrainingPlan,
} from "./training.ts";

export type LiftStat = {
  exerciseId: string;
  name: string;
  estimatedRm: number | null;
  topSet: string;
  source: string;
};

function normalizeLiftName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  const left = normalizeLiftName(a);
  const right = normalizeLiftName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function rmKgForExercise(rms: RmEntry[], exerciseName: string, week: number): number | null {
  const hits = rms.filter((entry) => entry.week === week && namesMatch(entry.name, exerciseName));
  if (hits.length === 0) return null;
  return Math.max(...hits.map((entry) => entry.estimatedRm));
}

function topSetLabel(load: ExerciseLoad): string {
  let bestKg = 0;
  let label = "";
  for (const set of load.sets) {
    const weight = parseWeight(set.weight);
    if (weight == null) continue;
    const kg = toKg(weight, set.unit);
    if (kg > bestKg) {
      bestKg = kg;
      label = `${formatWeight(kg, "kg")} kg`;
    }
  }
  return label;
}

function statFromLoad(name: string, exerciseId: string, prescription: string, systemId: string | null, load: ExerciseLoad): LiftStat {
  const slots = parseSetSlots(prescription);
  const resolved = inferSystemId(systemId, prescription, name);
  const roles = rolesForSlots(slots, resolved);
  const sets = setsForSlots(load, slots.length);
  const estimated = estimateRmFromSets(roles, sets, resolved);
  return {
    exerciseId,
    name,
    estimatedRm: estimated?.kg ?? null,
    topSet: topSetLabel(load),
    source: estimated?.source ?? "",
  };
}

function betterStat(current: LiftStat | undefined, next: LiftStat): LiftStat {
  if (!current) return next;
  if ((next.estimatedRm ?? 0) > (current.estimatedRm ?? 0)) return next;
  if (next.estimatedRm === current.estimatedRm && next.topSet && !current.topSet) return next;
  return current;
}

export function weekLiftStats(plan: TrainingPlan, loads: TrainingLoads, week: number): LiftStat[] {
  const exercises = new Map<string, { name: string; prescription: string; systemId: string | null }>();
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      exercises.set(exercise.id, {
        name: exercise.name,
        prescription: exercise.prescription,
        systemId: exercise.systemId,
      });
    }
  }

  const grouped = new Map<string, LiftStat>();
  const usedIds = new Set<string>();

  for (const snap of loads.history ?? []) {
    if (snap.week !== week) continue;
    const meta = exercises.get(snap.exerciseId);
    const name = meta?.name ?? snap.exerciseId;
    const stat = statFromLoad(
      name,
      snap.exerciseId,
      meta?.prescription ?? "3x5",
      meta?.systemId ?? null,
      { note: snap.note, sets: snap.sets },
    );
    usedIds.add(snap.exerciseId);
    grouped.set(name, betterStat(grouped.get(name), stat));
  }

  for (const [id, weeks] of Object.entries(loads.byExercise)) {
    if (usedIds.has(id)) continue;
    const load = weeks[weekIndex(week)];
    if (!load || !loadHasData(load)) continue;
    const meta = exercises.get(id);
    const name = meta?.name ?? id;
    const stat = statFromLoad(name, id, meta?.prescription ?? "3x5", meta?.systemId ?? null, load);
    grouped.set(name, betterStat(grouped.get(name), stat));
  }

  for (const entry of loads.rms ?? []) {
    if (entry.week !== week) continue;
    const name = entry.name.trim() || "Calculadora RM";
    const topSet = `${entry.reps}×${entry.weight} ${entry.unit}`;
    const next: LiftStat = {
      exerciseId: entry.id,
      name,
      estimatedRm: entry.estimatedRm,
      topSet,
      source: "calculadora",
    };
    const matchKey = [...grouped.keys()].find((key) => namesMatch(key, name));
    grouped.set(matchKey ?? name, betterStat(matchKey ? grouped.get(matchKey) : undefined, next));
  }

  return [...grouped.values()]
    .filter((item) => item.estimatedRm != null || item.topSet)
    .sort((a, b) => (b.estimatedRm ?? 0) - (a.estimatedRm ?? 0) || a.name.localeCompare(b.name, "es"));
}

export function weekDataCounts(loads: TrainingLoads, week: number): { snapshots: number; rms: number } {
  const snapshots = (loads.history ?? []).filter((item) => item.week === week).length;
  const rms = (loads.rms ?? []).filter((item) => item.week === week).length;
  if (snapshots > 0) return { snapshots, rms };
  let filled = 0;
  for (const weeks of Object.values(loads.byExercise)) {
    const load = weeks[weekIndex(week)];
    if (load && loadHasData(load)) filled += 1;
  }
  return { snapshots: filled, rms };
}
