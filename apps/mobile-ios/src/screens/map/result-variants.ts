export type PlanVariantView = {
  key: string;
  label: string;
  itinerary: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function variantLabel(value: string): string {
  switch (String(value || "").trim()) {
    case "balanced":
      return "平衡版";
    case "experience":
      return "体验版";
    default:
      return "推荐方案";
  }
}

export function extractPlanVariants(payload: Record<string, unknown>): PlanVariantView[] {
  const plans = asArray(payload.plans)
    .map((item) => asRecord(item))
    .map((item) => {
      const key = String(item.plan_variant || "").trim() || "default";
      const itinerary = asRecord(item.itinerary);
      return Object.keys(itinerary).length ? { key, label: variantLabel(key), itinerary } : null;
    })
    .filter((item): item is PlanVariantView => Boolean(item));

  if (plans.length) return plans;
  return [{ key: "default", label: "推荐方案", itinerary: payload }];
}
