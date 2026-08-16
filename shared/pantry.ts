export type PantryState = {
  periodId: string;
  checkedIds: string[];
};

export function emptyPantry(periodId: string): PantryState {
  return { periodId, checkedIds: [] };
}

export function coercePantry(value: unknown, periodId: string): PantryState | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as { checkedIds?: unknown };
  if (!Array.isArray(raw.checkedIds) || !raw.checkedIds.every((id) => typeof id === "string")) {
    return null;
  }
  return {
    periodId,
    checkedIds: [...new Set(raw.checkedIds)].slice(0, 300),
  };
}
