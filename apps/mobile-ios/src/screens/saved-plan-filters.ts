import type { SavedPlanListItem } from "../types/plan";

export type SavedPlanFilterKey = "all" | "upcoming" | "high_confidence";

function normalize(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function filterSavedPlans(
  items: SavedPlanListItem[],
  query: string,
  filter: SavedPlanFilterKey,
  today: string,
): SavedPlanListItem[] {
  const normalizedQuery = normalize(query);
  return items.filter((item) => {
    const matchesQuery =
      !normalizedQuery ||
      normalize(item.destination).includes(normalizedQuery) ||
      normalize(item.start_date).includes(normalizedQuery);

    if (!matchesQuery) return false;

    switch (filter) {
      case "upcoming":
        return String(item.start_date || "") >= today;
      case "high_confidence":
        return Number(item.confidence || 0) >= 0.7;
      default:
        return true;
    }
  });
}
