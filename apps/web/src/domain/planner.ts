import { randomUUID } from "node:crypto";
import { fallbackPoiProvider, type PoiProvider } from "./poi-provider";
import { buildPretripChecklist } from "./pretrip-checklist";
import { seededScore } from "./seeded-random";
import { getRouteTheme } from "./theme-catalog";
import type { PoiSeed, RouteCard, RouteCardRequest, RouteLeg, RouteStop } from "./types";

const stopTimes = ["10:00", "12:20", "15:00", "19:30"];

function normalizeCity(city: string): string {
  return city.trim() || "上海";
}

function noteTags(note: string): string[] {
  const text = note.toLowerCase();
  const tags: string[] = [];
  if (text.includes("咖啡") || text.includes("coffee")) tags.push("coffee");
  if (text.includes("拍照") || text.includes("photo") || text.includes("出片")) tags.push("photo");
  if (text.includes("雨")) tags.push("rain_friendly", "indoor");
  if (text.includes("小吃") || text.includes("吃")) tags.push("snack", "local_food");
  if (text.includes("少走") || text.includes("轻松") || text.includes("别太累")) tags.push("walkable", "relaxed");
  return tags;
}

function scorePoi(poi: PoiSeed, desiredTags: string[], avoidTags: string[]): number {
  let score = 0;
  for (const tag of desiredTags) {
    if (poi.tags.includes(tag)) score += 12;
  }
  for (const tag of avoidTags) {
    if (poi.tags.includes(tag)) score -= 20;
  }
  if (poi.indoor && desiredTags.includes("rain_friendly")) score += 10;
  score -= (poi.costLevel - 1) * 2;
  return score;
}

function estimateTransitMinutes(from: PoiSeed, to: PoiSeed): number {
  const latDiff = Math.abs(from.lat - to.lat);
  const lngDiff = Math.abs(from.lng - to.lng);
  const roughDistance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  return Math.max(8, Math.min(42, Math.round(roughDistance * 900 + 10)));
}

function mapUrlForPoi(poi: PoiSeed): string {
  return `https://uri.amap.com/marker?position=${poi.lng},${poi.lat}&name=${encodeURIComponent(poi.name)}`;
}

function reasonForPoi(poi: PoiSeed, themeLabel: string): string {
  if (poi.tags.includes("rain_friendly")) return `${poi.name} 适合 ${themeLabel}，天气变化时也容易调整停留时间。`;
  if (poi.tags.includes("local_food") || poi.tags.includes("snack")) return `${poi.name} 可以把吃和逛串在一起，减少单独找餐厅的决策成本。`;
  if (poi.tags.includes("night")) return `${poi.name} 适合作为当天收束点，夜间氛围更完整。`;
  if (poi.tags.includes("photo")) return `${poi.name} 出片点位集中，适合边走边拍。`;
  return `${poi.name} 和路线主题匹配，适合放进当天主线。`;
}

function riskForPoi(poi: PoiSeed): string {
  if (!poi.indoor && poi.tags.includes("outdoor_only")) return "户外停留较多，雨天建议准备备选点。";
  if (poi.openingHours !== "全天开放") return `营业时间参考 ${poi.openingHours}，出发前建议再确认。`;
  return "风险较低，适合按当前顺序前往。";
}

function buildStops(selected: PoiSeed[], themeLabel: string): RouteStop[] {
  return selected.map((poi, index) => ({
    id: `${index + 1}-${poi.id}`,
    time: stopTimes[index] || `${10 + index * 2}:00`,
    poiId: poi.id,
    poi: poi.name,
    tags: poi.tags,
    lat: poi.lat,
    lng: poi.lng,
    mapUrl: mapUrlForPoi(poi),
    reason: reasonForPoi(poi, themeLabel),
    risk: riskForPoi(poi),
    sourceMode: "fallback"
  }));
}

function buildLegs(selected: PoiSeed[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let index = 1; index < selected.length; index += 1) {
    legs.push({
      fromPoi: selected[index - 1].name,
      toPoi: selected[index].name,
      minutes: estimateTransitMinutes(selected[index - 1], selected[index]),
      sourceMode: "fallback"
    });
  }
  return legs;
}

function highlightForStop(stop: RouteStop): string {
  if (stop.tags.includes("local_food") || stop.tags.includes("snack")) return `${stop.poi} 串起本地吃法`;
  if (stop.tags.includes("night")) return `${stop.poi} 适合夜间收束`;
  if (stop.tags.includes("rain_friendly") || stop.tags.includes("indoor")) return `${stop.poi} 可作为天气备选`;
  if (stop.tags.includes("photo")) return `${stop.poi} 适合边走边拍`;
  return `${stop.poi} 是路线主节点`;
}

function buildHighlights(stops: RouteStop[]): string[] {
  return Array.from(new Set(stops.map(highlightForStop))).slice(0, 3);
}

function buildFitFor(themeLabel: string, note: string): string {
  const trimmedNote = note.trim();
  if (trimmedNote) return `适合想要${themeLabel}，同时偏好“${trimmedNote}”的轻旅行用户。`;
  return `适合想要${themeLabel}、不想做复杂攻略的轻旅行用户。`;
}

function buildSummary(label: string, promise: string, request: RouteCardRequest): string {
  const trimmedNote = request.note.trim();
  if (!trimmedNote) return `${label}路线：${promise}`;
  const notePrefix = request.planningContext ? "已重新校验" : "已考虑";
  return `${label}路线：${promise} ${notePrefix}：${trimmedNote}`;
}

function fitForRoute(themeLabel: string, request: RouteCardRequest): string {
  if (request.planningContext) return `适合想要${themeLabel}、可继续微调节奏的轻旅行用户。`;
  return buildFitFor(themeLabel, request.note);
}

function buildRiskTips(stops: RouteStop[], degraded: boolean): string[] {
  const tips = new Set<string>();
  if (degraded) tips.add("当前城市暂无种子数据，已用示例城市降级生成，请先核对点位可达性。");
  if (stops.some((stop) => stop.risk.includes("营业时间"))) tips.add("部分点位有营业时间，出发前建议再确认。");
  if (stops.some((stop) => !stop.tags.includes("indoor"))) tips.add("路线包含户外步行，雨天建议保留室内备选。");
  tips.add("交通时间为规则估算，实际以地图导航为准。");
  return Array.from(tips).slice(0, 3);
}

function confidenceFor(stops: RouteStop[], degraded: boolean): number {
  const base = degraded ? 0.48 : 0.72;
  const tagCoverage = Math.min(0.18, stops.length * 0.035);
  return Math.round((base + tagCoverage) * 100) / 100;
}

function stopCountForDuration(durationDays: 1 | 2, poolSize: number): number {
  const desired = durationDays === 2 ? 6 : 4;
  return Math.max(3, Math.min(desired, poolSize));
}

function durationLabel(durationDays: 1 | 2): string {
  return durationDays === 2 ? "2日" : "1日";
}

export function generateRouteCard(request: RouteCardRequest, provider: PoiProvider = fallbackPoiProvider): RouteCard {
  const city = normalizeCity(request.city);
  const theme = getRouteTheme(request.themeId);
  const citySupported = provider.getSupportedCities().includes(city);
  const pool = provider.getPois(city);
  const desiredTags = [...theme.primaryTags, ...theme.styleTags, ...noteTags(request.note)];
  const stopCount = stopCountForDuration(request.durationDays, pool.length);
  const label = durationLabel(request.durationDays);
  const selected = [...pool]
    .sort((left, right) => {
      const scoreDiff = scorePoi(right, desiredTags, theme.avoidTags) - scorePoi(left, desiredTags, theme.avoidTags);
      if (Math.abs(scoreDiff) > 12) return scoreDiff;
      return seededScore(request.routeSeed, right.id) - seededScore(request.routeSeed, left.id);
    })
    .slice(0, stopCount);

  const stops = buildStops(selected, theme.label);
  const legs = buildLegs(selected);
  const degraded = !citySupported;
  const confidence = confidenceFor(stops, degraded);

  const card: RouteCard = {
    id: randomUUID(),
    city,
    themeId: theme.id,
    themeLabel: theme.label,
    title: `${city}${label}${theme.label}`,
    summary: buildSummary(label, theme.promise, request),
    highlights: buildHighlights(stops),
    fitFor: fitForRoute(theme.label, request),
    riskTips: buildRiskTips(stops, degraded),
    sourceLabel: provider.getSourceLabel(),
    startDate: request.startDate,
    endDate: request.endDate,
    durationDays: request.durationDays,
    estimatedCostCny: selected.reduce((sum, poi) => sum + poi.costLevel * 80, 0),
    stops,
    legs,
    confidence,
    confidenceTier: confidence >= 0.78 ? "medium" : "needs_confirmation",
    degraded,
    degradedReason: degraded ? "city_seed_data_missing" : "",
    sourceMode: "fallback",
    share: {
      posterTitle: `${city} ${theme.label}`,
      posterSubtitle: stops.slice(0, 3).map((stop) => stop.poi).join(" · "),
      storyTitle: `把这一天过成${theme.label}`,
      storyCaption: `${stops.length} 个点位，${legs.reduce((sum, leg) => sum + leg.minutes, 0)} 分钟路上时间。`
    },
    createdAt: new Date().toISOString()
  };

  return { ...card, pretripChecklist: buildPretripChecklist(card) };
}
