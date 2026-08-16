import {
  brzyckiLoad,
  estimateOneRm,
  estimateOneRmLoose,
  formatLoadLabel,
  formatWeight,
  parseWeight,
  percentOfRm,
  toKg,
} from "./rm.ts";
import { setsForSlots, type SetLoad, type SetSlot } from "./training.ts";

export type SlotKind = "warmup" | "work" | "failure" | "drop" | "widow" | "timed";

export type SlotRole = {
  kind: SlotKind;
  reps?: number;
  percent?: number;
  dropStep: number;
  dropCount: number;
};

export type SlotTimer = {
  seconds: number;
  mode: "work" | "rest";
  label: string;
  steps?: number[];
};

export type SetCoach = {
  title: string;
  empty: boolean;
  prompt: string;
  details: string[];
  howto: string[];
  anchorIndex: number;
  suggested: (string | null)[];
  timers: (SlotTimer | null)[];
  hideWeight: boolean[];
};

const TITLES: Record<string, string> = {
  "strength-wave": "Progresión de fuerza",
  "rm-ladder": "Escalera de RM",
  "drop-set": "Drop set",
  widow: "Serie viuda",
  failure: "Al fallo",
  "rest-pause": "Rest pause",
  biserie: "Biserie",
  "twenty-ones": "21s",
  hold: "HOLD",
  plain: "Cómo cargar",
};

export function inferSystemId(systemId: string | null, prescription: string, name = ""): string {
  if (systemId) return systemId;
  const text = `${prescription} ${name}`;
  if (/viuda/i.test(text)) return "widow";
  if (/\d+\s*[xX]\s*\(\s*\d+\s*,/.test(prescription)) return "drop-set";
  if (/calentamiento/i.test(prescription) && /efectiv/i.test(prescription)) return "strength-wave";
  if (/%\s*rm/i.test(prescription)) return "rm-ladder";
  if (/rest\s*pause/i.test(text)) return "rest-pause";
  if (/\b21s?\b/i.test(prescription)) return "twenty-ones";
  if (/\bhold\b/i.test(text)) return "hold";
  if (/fallo/i.test(prescription)) return "failure";
  if (/biserie/i.test(name)) return "biserie";
  return "plain";
}

function extractSeconds(text: string): number | undefined {
  const match = text.match(/(\d+)\s*segundos/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value > 0 && value <= 600 ? value : undefined;
}

function timerForRole(
  role: SlotRole,
  slot: SetSlot,
  systemId: string,
): SlotTimer | null {
  const labelSeconds = extractSeconds(slot.label);
  if (role.kind === "timed" && labelSeconds) {
    return { seconds: labelSeconds, mode: "work", label: `${labelSeconds} s` };
  }
  if (role.kind === "widow" || systemId === "rest-pause") {
    const pause = extractSeconds(`${slot.label} ${slot.hint ?? ""}`) ?? 10;
    return { seconds: pause, mode: "rest", label: `Pausa ${pause} s` };
  }
  if (role.kind === "failure" && (systemId === "strength-wave" || extractSeconds(slot.hint ?? ""))) {
    const pause = extractSeconds(slot.hint ?? "") ?? 10;
    return { seconds: pause, mode: "rest", label: `Pausa ${pause} s` };
  }
  if (systemId === "hold" && role.reps && role.reps <= 12) {
    return {
      seconds: 1,
      mode: "work",
      label: "HOLD",
      steps: Array.from({ length: role.reps }, (_, index) => index + 1),
    };
  }
  return null;
}

function howToSteps(systemId: string, roles: SlotRole[]): string[] {
  switch (systemId) {
    case "strength-wave":
      return [
        "12 de calentamiento al 50% RM: salen completas, sin fallo.",
        "2×6 efectivas: peso de 6RM, cerca del fallo, forma limpia.",
        "Fallo: ~10% menos. Al fallo, 10 s (cronómetro) y otra microserie.",
      ];
    case "rm-ladder":
      return [
        "50% RM: calentamiento, no es serie pesada.",
        "70% RM: 8 reps (en tu guía, fallo entre 12 y 15; aquí queda margen).",
        "90% RM: 4 reps, rango de fuerza (4 a 6 al fallo).",
      ];
    case "drop-set":
      return [
        "Primera caída: esas reps cerca del fallo.",
        "Baja ~20%, sin sentarte. Siguiente número de reps.",
        "Otra caída igual. El descanso largo va al terminar la ronda.",
      ];
    case "widow":
      return [
        "Carga el % RM del paréntesis (80% o 60%): solo 5 a 8 reps seguidas.",
        "Al fallo, 10 s (cronómetro) y sigue. No sueltes mucho más de eso.",
        "Repite hasta completar las reps totales del paréntesis.",
      ];
    case "rest-pause":
      return [
        "Elige un peso que falle ~2 reps antes del número escrito.",
        "Al fallo, 10 s (cronómetro) y termina las reps.",
        "Eso es una serie. Descansa entre series como de costumbre.",
      ];
    case "twenty-ones":
      return [
        "~50% RM, más liviano que un 10RM.",
        "7 de la mitad baja, 7 de la mitad alta, 7 completas, sin parar.",
        "Si no llegas a las 21, baja el peso; no hagas trampa con impulso.",
      ];
    case "failure":
      return [
        "Peso alto si son pocas reps: hasta que no salga otra con buena forma.",
        "Corta la serie si se rompe la técnica, no si quema un poco.",
      ];
    case "hold":
      return [
        "1 rep y sostén 1 s, 2 reps y sostén 2 s, y así hasta las reps de la X.",
        "Usa el cronómetro del HOLD para cada sostén. Peso controlado (~70% RM).",
      ];
    case "biserie":
      return [
        "Haces las reps del primer movimiento y, sin descansar, las del segundo.",
        "Eso cuenta como una serie. Repite las que indica el número antes de la X.",
      ];
    default:
      if (roles.some((role) => role.kind === "timed")) {
        return ["Mantén la posición el tiempo de cada serie. Usa el cronómetro; no hace falta peso."];
      }
      return ["Cerca del fallo: 4–6 reps con peso serio; 12–15 con un peso que te deje terminar la serie."];
  }
}

function extractPercent(text: string): number | undefined {
  const match = text.match(/(\d+)\s*%\s*rm/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value >= 40 && value <= 100 ? value : undefined;
}

function extractReps(text: string): number | undefined {
  if (/segundos/i.test(text)) return undefined;
  const named = text.match(/(\d+)\s*reps/i);
  if (named) return Number(named[1]);
  const counted = text.match(/\d+\s*[xX]\s*(\d+)/);
  if (counted) return Number(counted[1]);
  const serie = text.match(/Serie\s+\d+\/\d+\s*·\s*(\d+)/);
  if (serie) return Number(serie[1]);
  return undefined;
}

function detectKind(text: string, systemId: string): SlotKind {
  if (/calentamiento/i.test(text) || extractPercent(text) === 50) return "warmup";
  if (/viuda/i.test(text) || systemId === "widow") return "widow";
  if (/fallo/i.test(text) || (systemId === "failure" && !/rest\s*pause/i.test(text))) return "failure";
  if (/segundos/i.test(text)) return "timed";
  if (/^Ronda\s+\d+/i.test(text) || systemId === "drop-set") return "drop";
  return "work";
}

function percentForTarget(role: SlotRole, systemId: string): number {
  if (role.percent) return role.percent;
  if (role.kind === "warmup") return 50;
  if (role.kind === "widow") return 80;
  if (role.kind === "failure") return 80;
  if (systemId === "twenty-ones") return 50;
  if (systemId === "hold") return 70;
  if (systemId === "rest-pause" && role.reps) {
    return ((37 - Math.max(1, role.reps - 2)) / 36) * 100;
  }
  if (role.reps && role.reps <= 12) return ((37 - role.reps) / 36) * 100;
  if (role.reps && role.reps <= 15) return 70;
  if (role.reps && role.reps <= 20) return 50;
  return 70;
}

export function rolesForSlots(slots: SetSlot[], systemId: string): SlotRole[] {
  const roles = slots.map((slot) => {
    const label = slot.label;
    const text = `${slot.label} ${slot.hint ?? ""}`;
    return {
      kind: detectKind(label, systemId),
      reps: extractReps(label),
      percent: extractPercent(text),
      dropStep: 0,
      dropCount: 1,
    };
  });
  let index = 0;
  while (index < roles.length) {
    if (roles[index].kind !== "drop") {
      index += 1;
      continue;
    }
    const round = slots[index].label.match(/^Ronda\s+(\d+)/i)?.[1] ?? "";
    let end = index + 1;
    while (end < roles.length && roles[end].kind === "drop") {
      const nextRound = slots[end].label.match(/^Ronda\s+(\d+)/i)?.[1] ?? "";
      if (round && nextRound && nextRound !== round) break;
      if (!round && nextRound) break;
      end += 1;
    }
    const count = end - index;
    for (let step = 0; step < count; step++) {
      roles[index + step].dropStep = step;
      roles[index + step].dropCount = count;
    }
    index = end;
  }
  return roles;
}

function capturedKg(set: SetLoad | undefined): number | null {
  if (!set) return null;
  const weight = parseWeight(set.weight);
  if (weight == null) return null;
  return toKg(weight, set.unit);
}

export function estimateRmFromSets(
  roles: SlotRole[],
  sets: SetLoad[],
  systemId: string,
): { kg: number; source: string } | null {
  const scored: { kg: number; source: string; score: number }[] = [];
  roles.forEach((role, index) => {
    const kg = capturedKg(sets[index]);
    if (kg == null) return;
    if (role.kind === "warmup" || role.kind === "timed") return;
    if (role.percent) {
      scored.push({
        kg: kg / (role.percent / 100),
        source: `${role.percent}% RM`,
        score: 5,
      });
      return;
    }
    if (role.kind === "work" && role.reps) {
      const repsUsed =
        systemId === "rest-pause" ? Math.max(1, Math.min(10, role.reps - 2)) : role.reps;
      const rm = repsUsed <= 10 ? estimateOneRm(kg, repsUsed) : estimateOneRmLoose(kg, role.reps);
      if (rm) {
        scored.push({
          kg: rm,
          source: systemId === "rest-pause" ? `~${repsUsed} antes de la pausa` : `${role.reps} reps`,
          score: 4,
        });
      }
      return;
    }
    if (role.kind === "failure" && role.reps) {
      const rm = estimateOneRm(kg, role.reps);
      if (rm) scored.push({ kg: rm, source: `fallo a ${role.reps}`, score: 3 });
      return;
    }
    if (role.kind === "drop" && role.dropStep === 0 && role.reps) {
      const rm = role.reps <= 10 ? estimateOneRm(kg, role.reps) : estimateOneRmLoose(kg, role.reps);
      if (rm) scored.push({ kg: rm, source: "primera caída", score: 3 });
      return;
    }
    if (role.kind === "widow") {
      scored.push({
        kg: kg / (percentForTarget(role, systemId) / 100),
        source: "serie viuda",
        score: 3,
      });
    }
  });
  if (scored.length === 0) {
    roles.forEach((role, index) => {
      const kg = capturedKg(sets[index]);
      if (kg == null || role.kind !== "warmup") return;
      scored.push({
        kg: kg / (percentForTarget(role, systemId) / 100),
        source: "calentamiento",
        score: 1,
      });
    });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || b.kg - a.kg);
  return { kg: Math.round(scored[0].kg), source: scored[0].source };
}

function workingKg(roles: SlotRole[], sets: SetLoad[]): number | null {
  for (let index = 0; index < roles.length; index++) {
    const role = roles[index];
    if (role.kind !== "work" && !(role.kind === "drop" && role.dropStep === 0)) continue;
    const kg = capturedKg(sets[index]);
    if (kg != null) return kg;
  }
  return null;
}

function siblingKg(roles: SlotRole[], sets: SetLoad[], role: SlotRole): number | null {
  for (let index = 0; index < roles.length; index++) {
    const other = roles[index];
    if (other.kind !== role.kind || other.reps !== role.reps || other.percent !== role.percent) continue;
    if (role.kind === "drop" && other.dropStep !== role.dropStep) continue;
    const kg = capturedKg(sets[index]);
    if (kg != null) return kg;
  }
  return null;
}

function suggestKg(
  role: SlotRole,
  rm: number | null,
  work: number | null,
  firstDrop: number | null,
  sibling: number | null,
  systemId: string,
): number | null {
  if (role.kind === "timed") return null;
  if (sibling != null) return sibling;
  if (role.kind === "drop") {
    const base =
      firstDrop ??
      (rm != null && role.reps ? brzyckiLoad(rm, role.reps) : work);
    if (base == null) return null;
    return base * 0.8 ** role.dropStep;
  }
  if (role.kind === "failure") {
    if (work != null) return work * 0.9;
    if (rm != null) return percentOfRm(rm, 80);
    return null;
  }
  if (rm != null) {
    if (role.percent) return percentOfRm(rm, role.percent);
    if (role.kind === "warmup") return percentOfRm(rm, 50);
    if (role.kind === "widow") return percentOfRm(rm, 80);
    if (systemId === "twenty-ones") return percentOfRm(rm, 50);
    if (systemId === "hold") return percentOfRm(rm, 70);
    if (systemId === "rest-pause" && role.reps) {
      return brzyckiLoad(rm, Math.max(1, role.reps - 2));
    }
    if (role.reps && role.reps <= 12) return brzyckiLoad(rm, role.reps);
    return percentOfRm(rm, percentForTarget(role, systemId));
  }
  if (work != null) {
    if (role.kind === "warmup") return work * 0.58;
    return work;
  }
  return null;
}

function anchorIndex(roles: SlotRole[], systemId: string): number {
  const find = (test: (role: SlotRole) => boolean) => roles.findIndex(test);
  if (systemId === "strength-wave") {
    const work = find((role) => role.kind === "work");
    if (work >= 0) return work;
  }
  if (systemId === "rm-ladder") {
    const heavy = find((role) => role.percent === 90);
    if (heavy >= 0) return heavy;
  }
  if (systemId === "drop-set") {
    const drop = find((role) => role.kind === "drop");
    if (drop >= 0) return drop;
  }
  const work = find((role) => role.kind === "work" || role.kind === "widow" || role.kind === "failure");
  return work >= 0 ? work : 0;
}

function kindLabel(role: SlotRole, systemId: string): string {
  if (role.kind === "warmup") {
    return role.reps ? `Calentamiento · ${role.reps} reps` : "Calentamiento";
  }
  if (role.kind === "failure") return "Al fallo";
  if (role.kind === "widow") {
    return role.reps ? `Serie viuda · ${role.reps} reps` : "Serie viuda";
  }
  if (role.kind === "drop") {
    return role.reps ? `Caída ${role.dropStep + 1} · ${role.reps} reps` : `Caída ${role.dropStep + 1}`;
  }
  if (systemId === "strength-wave" && role.reps === 6) return "Efectivas · 6 reps";
  if (systemId === "rest-pause" && role.reps) return `${role.reps} reps (rest pause)`;
  if (systemId === "twenty-ones") return "21s (7+7+7)";
  if (role.percent && role.reps) return `${role.reps} reps · ${role.percent}% RM`;
  if (role.percent) return `${role.percent}% RM`;
  if (role.reps) return `${role.reps} reps`;
  return "Serie de trabajo";
}

function emptyPrompt(systemId: string, slots: SetSlot[], roles: SlotRole[], anchor: number): string {
  const target = slots[anchor]?.label ?? "la primera serie de trabajo";
  switch (systemId) {
    case "strength-wave":
      return `Aún no hay peso. En ${target} anota un 6RM (cerca del fallo). El calentamiento a 12 va al 50% RM y el fallo ~10% más liviano, con 10 s entre microseries.`;
    case "rm-ladder":
      return `Aún no hay peso. Anota el de ${target} (4 reps duras, cerca del 90% RM). Con eso salen el 50% de calentamiento y el 70% de 8.`;
    case "drop-set":
      return `Aún no hay peso. Anota el de la primera caída (${target}): un peso de esas reps cerca del fallo. Luego baja ~20% y sigue sin descanso.`;
    case "widow":
      return `Aún no hay peso. Carga ~80% RM (5 a 8 reps duras) y anótalo. Al fallo, 10 s de pausa y sigues hasta las reps del paréntesis.`;
    case "rest-pause":
      return `Aún no hay peso. Anota un peso con el que falles 2 reps antes de terminar ${target}; pausa ~10 s y completa.`;
    case "twenty-ones":
      return `Aún no hay peso. Usa ~50% RM, más liviano que tu 10RM: 7 abajo, 7 arriba y 7 completas, sin parar.`;
    case "failure":
      return `Aún no hay peso. Anota el de ${target}: el más alto con el que llegues al fallo con buena forma.`;
    case "hold":
      return `Aún no hay peso. Anota el de la primera serie: controlado para sostener cada bloque del HOLD.`;
    case "biserie":
      return `Aún no hay peso. Anota el de ${target}. Es el mismo esquema en los dos movimientos, sin descanso entre ellos.`;
    default:
      return roles[anchor]?.kind === "timed"
        ? "Cada serie dura el tiempo escrito. Arranca el cronómetro y mantén la posición hasta el final."
        : `Aún no hay peso. Anota el de ${target} para calcular el resto de series.`;
  }
}

function filledPrompt(systemId: string, rm: { kg: number; source: string } | null, unit: SetLoad["unit"]): string {
  if (!rm) return "Con el peso que ya anotaste, usa el mismo esquema en las series que falten.";
  const rmLabel = formatLoadLabel(rm.kg, unit);
  switch (systemId) {
    case "strength-wave":
      return `RM ≈ ${rmLabel} (Brzycki, ${rm.source}). Calentamiento al 50% RM. Las 6 son tu 6RM. El fallo va ~10% más liviano, con 10 s entre microseries.`;
    case "rm-ladder":
      return `RM ≈ ${rmLabel} según ${rm.source}. 50% calienta, 70% las de 8, 90% las de 4 (4 a 6 al fallo).`;
    case "drop-set":
      return `Partimos de ${rm.source}. Cada caída baja ~20% y sigue sin descanso.`;
    case "widow":
      return `RM ≈ ${rmLabel}. Viuda a ~80% RM: 5 a 8 reps, 10 s y sigues hasta el total.`;
    case "failure":
      return `RM ≈ ${rmLabel}. Cada serie hasta que no salga otra rep limpia.`;
    case "rest-pause":
      return `RM ≈ ${rmLabel}. Peso de ~2 reps menos que el objetivo; al fallo, ~10 s y terminas.`;
    case "twenty-ones":
      return `RM ≈ ${rmLabel}. 21s al ~50% RM, más liviano que un 10RM, sin parar entre los 7+7+7.`;
    default:
      return `RM ≈ ${rmLabel} según ${rm.source}. Abajo va lo que cargar en cada tipo de serie.`;
  }
}

function firstDropKg(roles: SlotRole[], sets: SetLoad[]): number | null {
  for (let index = 0; index < roles.length; index++) {
    const role = roles[index];
    if (role.kind === "drop" && role.dropStep === 0) {
      const kg = capturedKg(sets[index]);
      if (kg != null) return kg;
    }
  }
  return null;
}

export function coachSets(input: {
  prescription: string;
  name?: string;
  systemId: string | null;
  systemName?: string;
  slots: SetSlot[];
  sets: SetLoad[];
  priorSets?: SetLoad[];
  knownRm?: number | null;
  knownRmSource?: string;
}): SetCoach {
  const systemId = inferSystemId(input.systemId, input.prescription, input.name);
  const roles = rolesForSlots(input.slots, systemId);
  const unit = input.sets[0]?.unit ?? "kg";
  const anyWeight = input.sets.some((set) => parseWeight(set.weight) != null);
  const priorPadded = setsForSlots({ note: "", sets: input.priorSets ?? [] }, roles.length);
  const liveRm = estimateRmFromSets(roles, input.sets, systemId);
  const rm =
    liveRm ??
    estimateRmFromSets(roles, priorPadded, systemId) ??
    (input.knownRm && input.knownRm > 0
      ? { kg: Math.round(input.knownRm), source: input.knownRmSource ?? "RM guardado" }
      : null);
  const fromPrior = !anyWeight && liveRm == null && rm != null;
  const work = workingKg(roles, input.sets) ?? workingKg(roles, priorPadded);
  const firstDrop = firstDropKg(roles, input.sets) ?? firstDropKg(roles, priorPadded);
  const anchor = Math.max(0, anchorIndex(roles, systemId));
  const suggested = roles.map((role, index) => {
    if (parseWeight(input.sets[index]?.weight ?? "")) return null;
    const kg = suggestKg(
      role,
      rm?.kg ?? null,
      work,
      firstDrop,
      siblingKg(roles, input.sets, role) ?? siblingKg(roles, priorPadded, role),
      systemId,
    );
    return kg == null ? null : formatWeight(kg, input.sets[index]?.unit ?? unit);
  });
  const details: string[] = [];
  const seen = new Set<string>();
  roles.forEach((role, index) => {
    if (role.kind === "timed") {
      const seconds = extractSeconds(`${input.slots[index].label} ${input.slots[index].hint ?? ""}`);
      if (seconds && !seen.has("timed")) {
        seen.add("timed");
        details.push(`Tiempo: ${seconds} s por serie`);
      }
      return;
    }
    const key =
      role.kind === "drop"
        ? `drop-${role.dropStep}-${role.reps ?? 0}`
        : `${role.kind}-${role.reps ?? 0}-${role.percent ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    const kg =
      capturedKg(input.sets[index]) ??
      suggestKg(
        role,
        rm?.kg ?? null,
        work,
        firstDrop,
        siblingKg(roles, input.sets, role) ?? siblingKg(roles, priorPadded, role),
        systemId,
      );
    if (kg == null) return;
    const prefix = capturedKg(input.sets[index]) != null ? "anotado" : "carga";
    details.push(`${kindLabel(role, systemId)}: ${prefix} ${formatLoadLabel(kg, input.sets[index]?.unit ?? unit)}`);
  });
  const timers = roles.map((role, index) => timerForRole(role, input.slots[index], systemId));
  const hideWeight = roles.map((role) => role.kind === "timed");
  return {
    title: input.systemName || TITLES[systemId] || TITLES.plain,
    empty: !anyWeight && !roles.every((role) => role.kind === "timed"),
    prompt: anyWeight
      ? filledPrompt(systemId, rm, unit)
      : fromPrior && rm
        ? `Aún no anotaste esta semana. La pasada el RM iba ~${formatLoadLabel(rm.kg, unit)} según ${rm.source}. Carga así y ajusta si salió fácil o pesado.`
        : emptyPrompt(systemId, input.slots, roles, anchor),
    details,
    howto: howToSteps(systemId, roles),
    anchorIndex: anchor,
    suggested,
    timers,
    hideWeight,
  };
}
