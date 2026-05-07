import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { AmapClient, type RealPoiCandidate } from "@/server/amap-client";
import { createRouteAiClient } from "@/server/route-ai-client";
import { createWebEvidenceProvider } from "@/server/web-evidence-provider";
import { arrangeCandidatesByRule, type AiRouteArrangement } from "./route-arrangement";
import { buildFallbackBlueprint, searchSlotsToAmapQueries, type RouteBlueprint } from "./route-blueprint";
import { generateRouteCard } from "./planner";
import { buildPretripChecklist } from "./pretrip-checklist";
import {
  assembleCard,
  buildLegs,
  buildStopsFromArrangement,
  dedupeCandidates,
  maybeAiArrangement,
  searchEvidenceSafely,
  type EvidenceSources,
  type PlannerAiClient,
  type PlannerAmapClient,
  type RealRoutePlannerDeps
} from "./real-route-planner";
import { createQueuedPlanningTrace, markTraceNode, mergeCompletedPlanningTrace } from "./planning-trace";
import type { AmapPoiQuery } from "./route-blueprint";
import type { PlanningMode, PlanningTraceEvent, RouteCard, RouteCardRequest, RouteLeg, RouteStop } from "./types";
import { inferUserIntent, type UserIntent } from "./user-intent";

export type RouteCritique = {
  accepted: boolean;
  reasons: string[];
  repairHints: string[];
  confidencePenalty: number;
};

export type TripPlanningGraphResult = {
  routeCard: RouteCard;
  planningTrace: PlanningTraceEvent[];
};

export type TripPlanningGraphState = {
  request: RouteCardRequest;
  intent?: UserIntent;
  blueprint?: RouteBlueprint;
  queries: AmapPoiQuery[];
  candidates: RealPoiCandidate[];
  evidenceSources: EvidenceSources;
  evidenceWarning?: string;
  arrangement?: AiRouteArrangement;
  planningMode?: PlanningMode;
  critique?: RouteCritique;
  repairAttempts: number;
  stops: RouteStop[];
  legs: RouteLeg[];
  routeCard?: RouteCard;
  planningTrace: PlanningTraceEvent[];
  warnings: string[];
  error?: string;
};

const GraphState = Annotation.Root({
  request: Annotation<RouteCardRequest>,
  intent: Annotation<UserIntent | undefined>,
  blueprint: Annotation<RouteBlueprint | undefined>,
  queries: Annotation<AmapPoiQuery[]>({ default: () => [] }),
  candidates: Annotation<RealPoiCandidate[]>({ default: () => [] }),
  evidenceSources: Annotation<EvidenceSources>({ default: () => [] }),
  evidenceWarning: Annotation<string | undefined>,
  arrangement: Annotation<AiRouteArrangement | undefined>,
  planningMode: Annotation<PlanningMode | undefined>,
  critique: Annotation<RouteCritique | undefined>,
  repairAttempts: Annotation<number>({ default: () => 0 }),
  stops: Annotation<RouteStop[]>({ default: () => [] }),
  legs: Annotation<RouteLeg[]>({ default: () => [] }),
  routeCard: Annotation<RouteCard | undefined>,
  planningTrace: Annotation<PlanningTraceEvent[]>({ default: createQueuedPlanningTrace }),
  warnings: Annotation<string[]>({ default: () => [] }),
  error: Annotation<string | undefined>
});

type GraphStateValue = typeof GraphState.State;
type GraphStateUpdate = Partial<GraphStateValue>;

function mark(
  state: GraphStateValue,
  nodeId: PlanningTraceEvent["nodeId"],
  status: PlanningTraceEvent["status"],
  detail?: string,
): PlanningTraceEvent[] {
  return markTraceNode(state.planningTrace || createQueuedPlanningTrace(), nodeId, status, detail);
}

function fallbackCardFor(state: GraphStateValue, detail: string): RouteCard {
  const fallback = generateRouteCard(state.request);
  const routeCard: RouteCard = {
    ...fallback,
    planningMode: "fallback_seed",
    degraded: true,
    degradedReason: "amap_candidate_supply_missing",
    sourceLabel: "本地示例数据",
    providerWarnings: ["当前使用本地示例数据，适合体验产品流程；出发前请核对真实地点。", detail]
  };
  routeCard.pretripChecklist = buildPretripChecklist(routeCard);
  return routeCard;
}

function critiqueArrangement(state: GraphStateValue): RouteCritique {
  const reasons: string[] = [];
  const repairHints: string[] = [];

  if (!state.arrangement) {
    reasons.push("缺少路线编排结果。");
    repairHints.push("使用规则编排从真实候选中生成路线。");
  }
  if (state.error === "ai_arrangement_invalid_or_missing" && state.repairAttempts < 1) {
    reasons.push("AI 编排无效，已要求 Repair Agent 复核。");
    repairHints.push("跳过本次 AI 结果，改用规则编排修复路线。");
  }
  if (state.candidates.length < 3) {
    reasons.push("真实候选地点不足。");
    repairHints.push("进入本地兜底路线。");
  }
  if (state.arrangement && state.arrangement.selectedStops.length < 3) {
    reasons.push("路线停靠点不足。");
    repairHints.push("补足至少三个真实候选点。");
  }
  if (state.legs.some((leg) => leg.degraded)) {
    repairHints.push("部分路程时间为估算，需要在质量提示中标记。");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    repairHints,
    confidencePenalty: reasons.length * 0.08
  };
}

function withTraceOnCard(routeCard: RouteCard, planningTrace: PlanningTraceEvent[]): RouteCard {
  return { ...routeCard, planningTrace: mergeCompletedPlanningTrace(planningTrace) };
}

export function createTripPlanningGraph(deps: RealRoutePlannerDeps = {}) {
  const amapClient: PlannerAmapClient = deps.amapClient || new AmapClient();
  const aiClient: PlannerAiClient | undefined = deps.aiClient || deps.openAiClient || createRouteAiClient();
  const evidenceProvider =
    deps.evidenceProvider ||
    createWebEvidenceProvider({
      SEARCH_PROVIDER: process.env.SEARCH_PROVIDER,
      EXA_API_KEY: process.env.EXA_API_KEY
    });

  async function intentAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    const intent = inferUserIntent({
      themeId: state.request.themeId,
      note: state.request.note,
      tripPreferences: state.request.tripPreferences,
      importedText: state.request.importedText,
      companion: state.request.companion,
      transportPreference: state.request.transportPreference,
      budgetRange: state.request.budgetRange,
      mustVisitText: state.request.mustVisitText,
      avoidText: state.request.avoidText
    });
    return {
      intent,
      planningTrace: mark(state, "intent_agent", "done", intent.intentSummary)
    };
  }

  async function researchPlanner(state: GraphStateValue): Promise<GraphStateUpdate> {
    if (!state.intent) throw new Error("intent_missing");
    const blueprint = buildFallbackBlueprint({ ...state.request, intent: state.intent });
    const queries = searchSlotsToAmapQueries(state.request.city, blueprint.searchSlots);
    return {
      blueprint,
      queries,
      planningTrace: mark(state, "research_planner", "done", `${queries.length} 组高德搜索策略`)
    };
  }

  async function poiSearchAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    const candidates = dedupeCandidates((await Promise.all(state.queries.map((query) => amapClient.searchPois(query)))).flat());
    const hasEnoughCandidates = candidates.length >= 3;
    return {
      candidates,
      error: hasEnoughCandidates ? undefined : "amap_candidate_supply_missing",
      planningTrace: mark(
        state,
        "poi_search_agent",
        hasEnoughCandidates ? "done" : "warning",
        hasEnoughCandidates ? `找到 ${candidates.length} 个真实地点候选` : "真实地点候选不足，进入本地兜底。",
      )
    };
  }

  async function evidenceAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    if (!state.intent) throw new Error("intent_missing");
    const evidence = await searchEvidenceSafely(evidenceProvider, state.request, state.intent.intentSummary, state.candidates);
    return {
      evidenceSources: evidence.evidenceSources,
      evidenceWarning: evidence.evidenceWarning,
      planningTrace: mark(
        state,
        "evidence_agent",
        evidence.evidenceWarning ? "warning" : "done",
        evidence.evidenceWarning || `找到 ${evidence.evidenceSources.length} 条公开证据`,
      )
    };
  }

  async function routeArchitectAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    if (!state.blueprint) throw new Error("blueprint_missing");
    const shouldAttemptAi = state.repairAttempts === 0;
    const aiArrangement = shouldAttemptAi
      ? await maybeAiArrangement(
          aiClient,
          state.request,
          state.candidates,
          state.blueprint.summary,
          state.evidenceSources,
        )
      : null;
    const attemptedAi = Boolean(aiClient && shouldAttemptAi);
    const aiArrangementInvalid = attemptedAi && !aiArrangement;
    const arrangement = aiArrangement || arrangeCandidatesByRule(state.candidates, state.request.durationDays, state.request.routeSeed);
    const planningMode: PlanningMode = aiArrangement ? "ai_amap" : "rule_amap";
    const stops = buildStopsFromArrangement(state.candidates, arrangement);
    const legs = await buildLegs(stops, amapClient);
    return {
      arrangement,
      planningMode,
      stops,
      legs,
      error: aiArrangementInvalid ? "ai_arrangement_invalid_or_missing" : undefined,
      planningTrace: mark(
        state,
        "route_architect_agent",
        aiArrangementInvalid ? "warning" : "done",
        planningMode === "ai_amap" ? "AI 已从真实候选中完成路线编排" : "AI 不可用或无效，已用规则编排兜底",
      )
    };
  }

  async function criticAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    const critique = critiqueArrangement(state);
    return {
      critique,
      planningTrace: mark(
        state,
        "critic_agent",
        critique.accepted ? "done" : "warning",
        critique.accepted ? "路线结构通过校验" : critique.reasons.join("；"),
      )
    };
  }

  async function repairAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    const arrangement = arrangeCandidatesByRule(state.candidates, state.request.durationDays, `${state.request.routeSeed || "repair"}-${state.repairAttempts + 1}`);
    const stops = buildStopsFromArrangement(state.candidates, arrangement);
    const legs = await buildLegs(stops, amapClient);
    return {
      arrangement,
      planningMode: "rule_amap",
      repairAttempts: state.repairAttempts + 1,
      stops,
      legs,
      error: undefined,
      planningTrace: mark(state, "repair_agent", "warning", "已用规则编排修复无效 AI 路线")
    };
  }

  async function pretripAgent(state: GraphStateValue): Promise<GraphStateUpdate> {
    return {
      planningTrace: mark(state, "pretrip_agent", "done", "已准备风险提醒和行前检查")
    };
  }

  async function composer(state: GraphStateValue): Promise<GraphStateUpdate> {
    if (!state.intent || !state.blueprint || !state.arrangement || !state.planningMode) throw new Error("composer_state_missing");
    const routeCard = assembleCard(
      state.request,
      state.stops,
      state.arrangement,
      state.planningMode === "ai_amap" ? "ai_amap" : "rule_amap",
      state.intent.intentSummary,
      state.blueprint.summary,
      state.legs,
      state.evidenceSources,
      state.evidenceWarning,
    );
    const planningTrace = mark(state, "composer", "done", "已输出地图 + 每日行程");
    return {
      routeCard: withTraceOnCard(routeCard, planningTrace),
      planningTrace
    };
  }

  async function fallbackComposer(state: GraphStateValue): Promise<GraphStateUpdate> {
    const planningTrace = mark(state, "composer", "done", "已输出本地兜底路线");
    const routeCard = fallbackCardFor(state, "真实地点候选不足，路线已标记为需确认。");
    return {
      routeCard: withTraceOnCard(routeCard, planningTrace),
      planningTrace
    };
  }

  function routeAfterPoiSearch(state: GraphStateValue): "fallback_composer" | "evidence_agent" {
    return state.candidates.length < 3 ? "fallback_composer" : "evidence_agent";
  }

  function routeAfterCritic(state: GraphStateValue): "repair_agent" | "pretrip_agent" {
    return state.critique && !state.critique.accepted && state.repairAttempts < 1 ? "repair_agent" : "pretrip_agent";
  }

  return new StateGraph(GraphState)
    .addNode("intent_agent", intentAgent)
    .addNode("research_planner", researchPlanner)
    .addNode("poi_search_agent", poiSearchAgent)
    .addNode("evidence_agent", evidenceAgent)
    .addNode("route_architect_agent", routeArchitectAgent)
    .addNode("critic_agent", criticAgent)
    .addNode("repair_agent", repairAgent)
    .addNode("pretrip_agent", pretripAgent)
    .addNode("composer", composer)
    .addNode("fallback_composer", fallbackComposer)
    .addEdge(START, "intent_agent")
    .addEdge("intent_agent", "research_planner")
    .addEdge("research_planner", "poi_search_agent")
    .addConditionalEdges("poi_search_agent", routeAfterPoiSearch, ["fallback_composer", "evidence_agent"])
    .addEdge("evidence_agent", "route_architect_agent")
    .addEdge("route_architect_agent", "critic_agent")
    .addConditionalEdges("critic_agent", routeAfterCritic, ["repair_agent", "pretrip_agent"])
    .addEdge("repair_agent", "route_architect_agent")
    .addEdge("pretrip_agent", "composer")
    .addEdge("composer", END)
    .addEdge("fallback_composer", END)
    .compile();
}

export async function generateGraphRouteCard(
  request: RouteCardRequest,
  deps: RealRoutePlannerDeps = {},
): Promise<TripPlanningGraphResult> {
  const graph = createTripPlanningGraph(deps);
  const result = await graph.invoke({
    request,
    queries: [],
    candidates: [],
    evidenceSources: [],
    repairAttempts: 0,
    stops: [],
    legs: [],
    planningTrace: createQueuedPlanningTrace(),
    warnings: []
  });
  if (!result.routeCard) {
    const fallback = generateRouteCard(request);
    const planningTrace = markTraceNode(result.planningTrace || createQueuedPlanningTrace(), "composer", "error", "Graph did not compose a route card.");
    return { routeCard: withTraceOnCard(fallback, planningTrace), planningTrace };
  }
  const planningTrace = mergeCompletedPlanningTrace(result.planningTrace || result.routeCard.planningTrace || []);
  return {
    routeCard: withTraceOnCard(result.routeCard, planningTrace),
    planningTrace
  };
}
