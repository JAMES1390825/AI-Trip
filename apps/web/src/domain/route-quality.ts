import type { PlanningMode, RouteCard, RouteCardRequest, RouteQualitySummary } from "./types";

type BuildRouteQualityInput = {
  request: RouteCardRequest;
  planningMode?: PlanningMode;
  sourceLabel: string;
  evidenceSources?: NonNullable<RouteCard["evidenceSources"]>;
  providerWarnings?: string[];
  degradedLegCount?: number;
};

const budgetLabels: Record<NonNullable<RouteCardRequest["budgetRange"]>, string> = {
  budget_friendly: "预算友好",
  balanced: "均衡舒适",
  flexible: "体验优先"
};

const companionLabels: Record<NonNullable<RouteCardRequest["companion"]>, string> = {
  solo: "独自出行",
  friends: "朋友同行",
  couple: "情侣出行",
  family: "亲子家庭",
  elderly: "带长辈"
};

const transportLabels: Record<NonNullable<RouteCardRequest["transportPreference"]>, string> = {
  walk_first: "优先步行",
  public_transit_ok: "公共交通可达",
  taxi_ok: "可打车衔接"
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function splitConstraintText(value?: string): string[] {
  return (value || "")
    .split(/[，,、\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function modeProviderHealth(planningMode: PlanningMode | undefined, evidenceCount: number): string[] {
  if (planningMode === "fallback_seed") {
    return ["本地兜底数据", "真实地点待复核", "规则编排"];
  }

  return [
    "高德地点候选",
    planningMode === "ai_amap" ? "AI 编排" : "规则编排",
    evidenceCount > 0 ? "Exa 公开证据" : "Exa 证据未附加"
  ];
}

export function buildRouteQualitySummary(input: BuildRouteQualityInput): RouteQualitySummary {
  const evidenceSources = input.evidenceSources || [];
  const providerWarnings = input.providerWarnings || [];
  const degradedLegCount = input.degradedLegCount || 0;
  const satisfied: string[] = [];
  const tradeoffs: string[] = [];
  const confirmationNeeded: string[] = [];

  if (input.request.budgetRange) satisfied.push(`预算：已按「${budgetLabels[input.request.budgetRange]}」作为筛选倾向。`);
  const mustVisitItems = splitConstraintText(input.request.mustVisitText);
  if (mustVisitItems.length) satisfied.push(`必去线索：已优先检索 ${mustVisitItems.join("、")}。`);
  const avoidItems = splitConstraintText(input.request.avoidText);
  if (avoidItems.length) satisfied.push(`避开要求：已纳入 ${avoidItems.join("、")}。`);
  if (input.request.companion) satisfied.push(`同行：已按「${companionLabels[input.request.companion]}」调整节奏表达。`);
  if (input.request.transportPreference) satisfied.push(`交通：已考虑「${transportLabels[input.request.transportPreference]}」。`);

  if (mustVisitItems.length) {
    tradeoffs.push("必去地点会优先进入检索，但仍会受真实候选、顺路性和开放状态影响。");
  }
  if (avoidItems.length) {
    tradeoffs.push("避开要求会影响候选和说明，现场排队、天气和临时管控仍需出发前复核。");
  }
  if (degradedLegCount > 0) {
    tradeoffs.push("部分路段缺少实时步行估算，已用保守时间衔接。");
  }
  if (!evidenceSources.length) {
    tradeoffs.push("当前没有附加公开攻略证据，路线主要依赖地图候选和规划规则。");
  }

  confirmationNeeded.push(...providerWarnings.slice(0, 3));
  if (input.planningMode === "fallback_seed") {
    confirmationNeeded.push("当前为本地兜底结果，出发前请用地图复核地点、营业和交通。");
  }
  if (!confirmationNeeded.length) confirmationNeeded.push("出发前仍建议复核营业时间、天气和实时交通。");

  const matchScore = clamp(
    72 +
      (input.planningMode === "ai_amap" ? 10 : 0) +
      (input.planningMode === "rule_amap" ? 5 : 0) +
      (evidenceSources.length > 0 ? 6 : 0) -
      degradedLegCount * 8 -
      providerWarnings.length * 4 -
      (input.planningMode === "fallback_seed" ? 16 : 0),
    45,
    96,
  );

  return {
    matchScore,
    satisfied: satisfied.length ? satisfied : ["已按城市、日期和偏好生成可执行路线。"],
    tradeoffs: tradeoffs.length ? tradeoffs : ["当前路线未发现明显取舍，主要按真实候选顺路性编排。"],
    confirmationNeeded: Array.from(new Set(confirmationNeeded)),
    providerHealth: modeProviderHealth(input.planningMode, evidenceSources.length)
  };
}
