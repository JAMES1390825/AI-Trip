import { randomUUID } from "node:crypto";
import { AmapClient, type RealPoiCandidate } from "@/server/amap-client";
import { createRouteAiClient, type RouteAiJsonClient } from "@/server/route-ai-client";
import { arrangeCandidatesByRule, validateAiArrangement, type AiRouteArrangement } from "./route-arrangement";
import { buildFallbackBlueprint, searchSlotsToAmapQueries } from "./route-blueprint";
import { getRouteTheme } from "./theme-catalog";
import { generateRouteCard } from "./planner";
import { buildPretripChecklist } from "./pretrip-checklist";
import type { RouteCard, RouteCardRequest, RouteLeg, RouteStop } from "./types";
import { inferUserIntent } from "./user-intent";

const stopTimes = ["10:00", "12:20", "15:00", "19:30", "10:00", "12:20", "15:30", "19:30"];

type PlannerAmapClient = Pick<AmapClient, "searchPois" | "estimateWalkingMinutes">;
type PlannerAiClient = RouteAiJsonClient;

export type RealRoutePlannerDeps = {
  amapClient?: PlannerAmapClient;
  aiClient?: PlannerAiClient;
  openAiClient?: PlannerAiClient;
};

function dedupeCandidates(candidates: RealPoiCandidate[]): RealPoiCandidate[] {
  const seen = new Set<string>();
  const results: RealPoiCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    results.push(candidate);
  }
  return results;
}

function mapUrlFor(candidate: RealPoiCandidate): string {
  return `https://uri.amap.com/marker?position=${candidate.lng},${candidate.lat}&name=${encodeURIComponent(candidate.name)}`;
}

async function buildLegs(stops: RouteStop[], amapClient: PlannerAmapClient): Promise<RouteLeg[]> {
  const legs: RouteLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const minutes = await amapClient.estimateWalkingMinutes({
      from: { lat: stops[index - 1].lat, lng: stops[index - 1].lng },
      to: { lat: stops[index].lat, lng: stops[index].lng }
    });
    legs.push({
      fromPoi: stops[index - 1].poi,
      toPoi: stops[index].poi,
      minutes: minutes || 18,
      degraded: !minutes,
      sourceMode: minutes ? "provider" : "mixed"
    });
  }
  return legs;
}

function buildStopsFromArrangement(candidates: RealPoiCandidate[], arrangement: AiRouteArrangement): RouteStop[] {
  const selectedById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return arrangement.selectedStops.map((selected, index) => {
    const candidate = selectedById.get(selected.candidateId);
    if (!candidate) throw new Error(`Missing candidate ${selected.candidateId}`);
    return {
      id: `${index + 1}-${candidate.id}`,
      time: stopTimes[index] || `${10 + index * 2}:00`,
      poiId: candidate.id,
      providerPoiId: candidate.providerPoiId,
      poi: candidate.name,
      tags: candidate.tags,
      lat: candidate.lat,
      lng: candidate.lng,
      address: candidate.address,
      providerType: candidate.providerType,
      day: selected.day,
      mapUrl: mapUrlFor(candidate),
      reason: selected.reason,
      risk: candidate.tags.includes("indoor") ? "室内点位，天气风险较低。" : "出发前建议确认天气和现场开放状态。",
      sourceMode: "provider"
    };
  });
}

function assembleCard(
  request: RouteCardRequest,
  stops: RouteStop[],
  arrangement: AiRouteArrangement,
  mode: "ai_amap" | "rule_amap",
  intentSummary: string,
  blueprintSummary: string,
  legs: RouteLeg[],
): RouteCard {
  const theme = getRouteTheme(request.themeId);
  const totalTransit = legs.reduce((sum, leg) => sum + leg.minutes, 0);
  const providerWarnings = ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"];
  if (legs.some((leg) => leg.degraded)) providerWarnings.push("部分路程时间为估算，实际以地图导航为准。");

  const card: RouteCard = {
    id: randomUUID(),
    city: request.city,
    themeId: theme.id,
    themeLabel: theme.label,
    title: `${request.city}${request.durationDays === 2 ? "2日" : "1日"}${theme.label}`,
    summary: `${request.durationDays}日路线：${intentSummary}。${blueprintSummary}`,
    highlights: stops.slice(0, 3).map((stop) => `${stop.poi} 是路线主节点`),
    fitFor: `适合${intentSummary}的轻旅行用户。`,
    riskTips: providerWarnings,
    sourceLabel: mode === "ai_amap" ? "Amap real map data + AI planning" : "Amap real map data + rule planning",
    planningMode: mode,
    intentSummary,
    blueprintSummary,
    arrangementReason: arrangement.arrangementReason,
    skipSuggestion: arrangement.skipSuggestion,
    weatherAlternative: arrangement.weatherAlternative,
    providerWarnings,
    startDate: request.startDate,
    durationDays: request.durationDays,
    estimatedCostCny: stops.length * 80,
    stops,
    legs,
    confidence: mode === "ai_amap" ? 0.86 : 0.78,
    confidenceTier: mode === "ai_amap" ? "high" : "medium",
    degraded: false,
    degradedReason: "",
    sourceMode: "provider",
    share: {
      posterTitle: `${request.city} ${theme.label}`,
      posterSubtitle: stops.slice(0, 3).map((stop) => stop.poi).join(" · "),
      storyTitle: `把这一天过成${theme.label}`,
      storyCaption: `${stops.length} 个真实地点，${totalTransit} 分钟路上时间。`
    },
    createdAt: new Date().toISOString()
  };

  return { ...card, pretripChecklist: buildPretripChecklist(card) };
}

async function maybeAiArrangement(
  aiClient: PlannerAiClient | undefined,
  request: RouteCardRequest,
  candidates: RealPoiCandidate[],
  blueprintSummary: string,
): Promise<AiRouteArrangement | null> {
  if (!aiClient) return null;
  const raw = await aiClient.createJson<unknown>(
    "You arrange travel routes. Only choose candidateId values from the provided candidates. Do not invent POIs.",
    JSON.stringify({ request, blueprintSummary, candidates: candidates.map(({ id, name, address, tags }) => ({ id, name, address, tags })) }),
    {
      type: "object",
      properties: {
        selectedStops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidateId: { type: "string" },
              day: { type: "number" },
              reason: { type: "string" }
            },
            required: ["candidateId", "day", "reason"],
            additionalProperties: false
          }
        },
        arrangementReason: { type: "string" },
        skipSuggestion: { type: "string" },
        weatherAlternative: { type: "string" }
      },
      required: ["selectedStops", "arrangementReason", "skipSuggestion", "weatherAlternative"],
      additionalProperties: false
    },
  );
  const validation = validateAiArrangement(raw, candidates, request.durationDays);
  return validation.ok ? validation.arrangement : null;
}

export async function generateRealRouteCard(request: RouteCardRequest, deps: RealRoutePlannerDeps = {}): Promise<RouteCard> {
  const amapClient = deps.amapClient || new AmapClient();
  const aiClient = deps.aiClient || deps.openAiClient || createRouteAiClient();
  const intent = inferUserIntent({ themeId: request.themeId, note: request.note });
  const blueprint = buildFallbackBlueprint({ ...request, intent });
  const queries = searchSlotsToAmapQueries(request.city, blueprint.searchSlots);
  const candidates = dedupeCandidates((await Promise.all(queries.map((query) => amapClient.searchPois(query)))).flat());

  if (candidates.length < 3) {
    const fallback = generateRouteCard(request);
    const fallbackCard: RouteCard = {
      ...fallback,
      planningMode: "fallback_seed",
      degraded: true,
      degradedReason: "amap_candidate_supply_missing",
      sourceLabel: "本地示例数据",
      providerWarnings: ["当前使用本地示例数据，适合体验产品流程；出发前请核对真实地点。"]
    };
    return { ...fallbackCard, pretripChecklist: buildPretripChecklist(fallbackCard) };
  }

  const aiArrangement = await maybeAiArrangement(aiClient, request, candidates, blueprint.summary);
  const arrangement = aiArrangement || arrangeCandidatesByRule(candidates, request.durationDays);
  const mode = aiArrangement ? "ai_amap" : "rule_amap";
  const stops = buildStopsFromArrangement(candidates, arrangement);
  const legs = await buildLegs(stops, amapClient);

  return assembleCard(request, stops, arrangement, mode, intent.intentSummary, blueprint.summary, legs);
}
