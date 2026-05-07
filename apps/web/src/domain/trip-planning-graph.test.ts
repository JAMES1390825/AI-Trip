import assert from "node:assert/strict";
import test from "node:test";
import type { RealPoiCandidate } from "@/server/amap-client";
import type { WebEvidenceProvider } from "@/server/web-evidence-provider";
import { generateGraphRouteCard } from "./trip-planning-graph";
import type { RouteCardRequest } from "./types";

const realCandidates: RealPoiCandidate[] = [
  { id: "a", providerPoiId: "a", name: "湖滨步行街", city: "杭州", address: "湖滨路", providerType: "街区", lat: 30, lng: 120, tags: ["photo", "walkable"], sourceMode: "provider" },
  { id: "b", providerPoiId: "b", name: "南宋御街小吃", city: "杭州", address: "中山中路", providerType: "餐饮", lat: 30.01, lng: 120.01, tags: ["local_food"], sourceMode: "provider" },
  { id: "c", providerPoiId: "c", name: "城市阳台", city: "杭州", address: "之江路", providerType: "景点", lat: 30.02, lng: 120.02, tags: ["landmark"], sourceMode: "provider" },
  { id: "d", providerPoiId: "d", name: "室内展馆", city: "杭州", address: "展馆路", providerType: "文化", lat: 30.03, lng: 120.03, tags: ["culture", "indoor"], sourceMode: "provider" }
];

const request: RouteCardRequest = {
  city: "杭州",
  themeId: "classic",
  startDate: "2026-05-10",
  durationDays: 1,
  note: "想拍照，别太累"
};

const evidenceProvider: WebEvidenceProvider = {
  searchEvidence: async () => [
    {
      title: "杭州轻松 citywalk 攻略",
      url: "https://example.com/hangzhou-walk",
      sourceName: "example.com",
      snippet: "湖滨步行街适合拍照，南宋御街适合安排小吃。",
      usedFor: "context"
    }
  ]
};

test("generateGraphRouteCard runs the multi-agent happy path and returns trace", async () => {
  const result = await generateGraphRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    evidenceProvider,
    aiClient: {
      createJson: async <T,>() =>
        ({
          selectedStops: [
            { candidateId: "a", day: 1, reason: "适合拍照和轻松散步。" },
            { candidateId: "b", day: 1, reason: "适合作为餐食节点。" },
            { candidateId: "c", day: 1, reason: "作为视野开阔的收束点。" }
          ],
          arrangementReason: "按散步、餐食、收束排列。",
          skipSuggestion: "太累就跳过城市阳台。",
          weatherAlternative: "下雨优先替换到室内展馆。"
        }) as T
    }
  });

  assert.equal(result.routeCard.planningMode, "ai_amap");
  assert.equal(result.routeCard.planningTrace?.length, result.planningTrace.length);
  assert.ok(result.planningTrace.some((event) => event.nodeId === "intent_agent" && event.status === "done"));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "poi_search_agent" && event.status === "done"));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "route_architect_agent" && event.status === "done"));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "critic_agent" && event.status === "done"));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "composer" && event.status === "done"));
});

test("generateGraphRouteCard routes to fallback when Amap has no candidates", async () => {
  const result = await generateGraphRouteCard(request, {
    amapClient: { searchPois: async () => [], estimateWalkingMinutes: async () => null }
  });

  assert.equal(result.routeCard.planningMode, "fallback_seed");
  assert.equal(result.routeCard.degraded, true);
  assert.ok(result.planningTrace.some((event) => event.nodeId === "poi_search_agent" && event.status === "warning"));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "composer" && event.status === "done"));
});

test("generateGraphRouteCard continues when evidence provider fails", async () => {
  const result = await generateGraphRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    evidenceProvider: {
      searchEvidence: async () => {
        throw new Error("exa unavailable");
      }
    }
  });

  assert.equal(result.routeCard.sourceMode, "provider");
  assert.ok(result.routeCard.providerWarnings?.some((warning) => warning.includes("公开攻略证据")));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "evidence_agent" && event.status === "warning"));
});

test("generateGraphRouteCard falls back to rule planning when AI arrangement is invalid", async () => {
  const result = await generateGraphRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    aiClient: {
      createJson: async <T,>() =>
        ({
          selectedStops: [
            { candidateId: "missing", day: 1, reason: "不存在的候选。" },
            { candidateId: "a", day: 1, reason: "适合拍照。" },
            { candidateId: "b", day: 1, reason: "适合吃饭。" }
          ],
          arrangementReason: "错误编排。",
          skipSuggestion: "无。",
          weatherAlternative: "无。"
        }) as T
    }
  });

  assert.equal(result.routeCard.planningMode, "rule_amap");
  assert.ok(result.planningTrace.some((event) => event.nodeId === "repair_agent" && event.status === "warning"));
  assert.ok(result.planningTrace.some((event) => event.nodeId === "critic_agent" && event.status === "done"));
});
