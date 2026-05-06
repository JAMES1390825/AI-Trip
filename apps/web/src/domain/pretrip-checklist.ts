import type { PretripChecklistItem, PretripChecklistSeverity, RouteCard } from "./types";

type DraftChecklistItem = Omit<PretripChecklistItem, "id">;

const severityRank: Record<PretripChecklistSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1
};

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function makeItem(item: DraftChecklistItem, index: number): PretripChecklistItem {
  return {
    id: `${item.category}-${index + 1}-${slug(item.title) || "item"}`,
    ...item
  };
}

function hasOutdoorStop(routeCard: RouteCard): boolean {
  return routeCard.stops.some((stop) => !stop.tags.includes("indoor"));
}

function hasOpeningRisk(risk: string): boolean {
  return risk.includes("营业时间") || risk.includes("开放") || risk.includes("预约");
}

function totalTransitMinutes(routeCard: RouteCard): number {
  return routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);
}

function dedupe(items: DraftChecklistItem[]): DraftChecklistItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.category}:${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildPretripChecklist(routeCard: RouteCard): PretripChecklistItem[] {
  const items: DraftChecklistItem[] = [];
  const openingStop = routeCard.stops.find((stop) => hasOpeningRisk(stop.risk));
  const longLeg = routeCard.legs.find((leg) => leg.minutes > 30 || leg.degraded);
  const bookingTip = [...routeCard.riskTips, ...(routeCard.providerWarnings ?? [])].find((tip) => tip.includes("预约"));

  if (openingStop) {
    items.push({
      category: "time",
      title: "出发前确认营业状态",
      detail: `${openingStop.poi}：${openingStop.risk}`,
      severity: "warning",
      actionLabel: "确认开放时间",
      relatedStopId: openingStop.id
    });
  }

  if (hasOutdoorStop(routeCard)) {
    items.push({
      category: "weather",
      title: "保留雨天或高温备选",
      detail: routeCard.weatherAlternative || "路线包含户外步行，出发前建议确认天气，并准备室内备选。",
      severity: routeCard.themeId === "rain_backup" ? "info" : "warning",
      actionLabel: "查看天气"
    });
  }

  if (longLeg) {
    items.push({
      category: "traffic",
      title: "预留交通缓冲时间",
      detail: longLeg.degraded
        ? `${longLeg.fromPoi} 到 ${longLeg.toPoi} 的交通时间需要以实时导航为准。`
        : `${longLeg.fromPoi} 到 ${longLeg.toPoi} 预计 ${longLeg.minutes} 分钟，建议预留缓冲。`,
      severity: longLeg.degraded ? "critical" : "warning",
      actionLabel: "查看实时路线"
    });
  }

  if (routeCard.estimatedCostCny >= 400) {
    items.push({
      category: "budget",
      title: "确认当日预算",
      detail: `当前路线预估 ${routeCard.estimatedCostCny} 元，建议出发前确认门票、餐饮和交通预算。`,
      severity: routeCard.estimatedCostCny >= 600 ? "critical" : "warning",
      actionLabel: "核对预算"
    });
  }

  if ((routeCard.durationDays === 1 && routeCard.stops.length >= 4) || totalTransitMinutes(routeCard) > 70) {
    items.push({
      category: "comfort",
      title: "安排体力恢复点",
      detail: "路线节奏较满，建议提前标记可休息、补水或临时缩短的节点。",
      severity: "info",
      actionLabel: "规划休息点"
    });
  }

  if (bookingTip) {
    items.push({
      category: "booking",
      title: "确认预约要求",
      detail: bookingTip,
      severity: "warning",
      actionLabel: "检查预约"
    });
  }

  return dedupe(items)
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])
    .slice(0, 5)
    .map(makeItem);
}
