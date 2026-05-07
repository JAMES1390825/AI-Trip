import assert from "node:assert/strict";
import test from "node:test";
import { generateRealRouteCard } from "./real-route-planner";
import type { RealPoiCandidate } from "@/server/amap-client";
import type { WebEvidenceProvider } from "@/server/web-evidence-provider";

const realCandidates: RealPoiCandidate[] = [
  { id: "a", providerPoiId: "a", name: "湖滨步行街", city: "杭州", address: "湖滨路", providerType: "街区", lat: 30, lng: 120, tags: ["photo", "walkable"], sourceMode: "provider" },
  { id: "b", providerPoiId: "b", name: "南宋御街小吃", city: "杭州", address: "中山中路", providerType: "餐饮", lat: 30.01, lng: 120.01, tags: ["local_food"], sourceMode: "provider" },
  { id: "c", providerPoiId: "c", name: "城市阳台", city: "杭州", address: "之江路", providerType: "景点", lat: 30.02, lng: 120.02, tags: ["landmark"], sourceMode: "provider" },
  { id: "d", providerPoiId: "d", name: "室内展馆", city: "杭州", address: "展馆路", providerType: "文化", lat: 30.03, lng: 120.03, tags: ["culture", "indoor"], sourceMode: "provider" }
];

const request = { city: "杭州", themeId: "classic" as const, startDate: "2026-05-10", durationDays: 1 as const, note: "想拍照，别太累" };

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

test("generateRealRouteCard falls back to local seed planner when Amap has no candidates", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => [], estimateWalkingMinutes: async () => null }
  });

  assert.equal(card.planningMode, "fallback_seed");
  assert.equal(card.degraded, true);
  assert.ok(card.qualitySummary);
  assert.ok(card.qualitySummary.providerHealth.some((item) => item.includes("本地兜底")));
  assert.ok(card.pretripChecklist);
  assert.ok(card.pretripChecklist.length >= 1);
});

test("generateRealRouteCard uses Amap rule planning when real candidates exist without OpenAI", async () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const originalBailianKey = process.env.BAILIAN_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.BAILIAN_API_KEY;
  try {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 12 }
  });

  assert.equal(card.planningMode, "rule_amap");
  assert.equal(card.sourceMode, "provider");
  assert.equal(card.stops[0].sourceMode, "provider");
  assert.ok(card.stops[0].address);
  assert.ok(card.arrangementReason);
  assert.ok(card.pretripChecklist);
  assert.ok(card.pretripChecklist.length >= 1);
  assert.ok(card.pretripChecklist.some((item) => item.category === "booking" || item.category === "weather"));
  } finally {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
    if (originalBailianKey === undefined) delete process.env.BAILIAN_API_KEY;
    else process.env.BAILIAN_API_KEY = originalBailianKey;
  }
});

test("generateRealRouteCard includes trip preference fields in production intent inference", async () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const originalBailianKey = process.env.BAILIAN_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.BAILIAN_API_KEY;
  try {
    const card = await generateRealRouteCard(
      {
        ...request,
        note: "",
        tripPreferences: ["拍照出片", "吃喝逛", "少走路"],
        companion: "friends",
        transportPreference: "walk_first",
        budgetRange: "budget_friendly",
        mustVisitText: "西湖",
        avoidText: "不要太赶"
      },
      {
        amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 12 }
      },
    );

    assert.match(card.intentSummary || "", /轻松/);
    assert.match(card.intentSummary || "", /拍照友好/);
    assert.match(card.intentSummary || "", /美食优先/);
    assert.match(card.intentSummary || "", /低预算/);
    assert.ok(card.qualitySummary);
    assert.ok(card.qualitySummary.satisfied.some((item) => item.includes("西湖")));
    assert.ok(card.qualitySummary.satisfied.some((item) => item.includes("预算")));
  } finally {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
    if (originalBailianKey === undefined) delete process.env.BAILIAN_API_KEY;
    else process.env.BAILIAN_API_KEY = originalBailianKey;
  }
});

test("generateRealRouteCard accepts valid AI arrangement over candidates", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    openAiClient: {
      createJson: async <T,>() =>
        ({
          selectedStops: [
            { candidateId: "b", day: 1, reason: "先吃点东西，降低决策成本。" },
            { candidateId: "a", day: 1, reason: "适合拍照和轻松散步。" },
            { candidateId: "c", day: 1, reason: "作为视野开阔的收束点。" }
          ],
          arrangementReason: "按吃饭、散步、收束排列。",
          skipSuggestion: "太累就跳过城市阳台。",
          weatherAlternative: "下雨优先替换到室内展馆。"
        }) as T
    }
  });

  assert.equal(card.planningMode, "ai_amap");
  assert.equal(card.stops[0].poi, "南宋御街小吃");
  assert.equal(card.skipSuggestion, "太累就跳过城市阳台。");
});

test("generateRealRouteCard does not expose internal planning context to AI prompt", async () => {
  let capturedPrompt = "";

  await generateRealRouteCard(
    {
      ...request,
      note: "优化「湖滨步行街」附近路线，减少步行距离。",
      planningContext: [
        "原路线意图：适合想要经典初游路线，同时偏好“想拍照，别太累”的轻旅行用户。",
        "当前路线节点：湖滨步行街 -> 南宋御街小吃 -> 城市阳台",
        "用户调整要求：优化「湖滨步行街」附近路线，减少步行距离。",
        "请基于调整要求重新编排路线。"
      ].join("\n")
    },
    {
      amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
      openAiClient: {
        createJson: async <T,>(_systemPrompt: string, userPrompt: string) => {
          capturedPrompt = userPrompt;
          return {
            selectedStops: [
              { candidateId: "a", day: 1, reason: "保留湖滨步行街作为轻松起点。" },
              { candidateId: "b", day: 1, reason: "用南宋御街小吃承接餐食。" },
              { candidateId: "c", day: 1, reason: "用城市阳台收束。" }
            ],
            arrangementReason: "按轻松、餐食、收束排列。",
            skipSuggestion: "太累就跳过城市阳台。",
            weatherAlternative: "下雨改去室内展馆。"
          } as T;
        }
      }
    },
  );

  assert.match(capturedPrompt, /优化「湖滨步行街」附近路线，减少步行距离。/);
  assert.doesNotMatch(capturedPrompt, /planningContext/);
  assert.doesNotMatch(capturedPrompt, /原路线意图|当前路线节点|用户调整要求|请基于调整要求/);
});

test("generateRealRouteCard attaches configured web evidence without changing Amap facts", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    evidenceProvider,
    openAiClient: {
      createJson: async <T,>() =>
        ({
          selectedStops: [
            { candidateId: "a", day: 1, reason: "湖滨步行街有公开攻略证据支持拍照。" },
            { candidateId: "b", day: 1, reason: "南宋御街适合作为餐食节点。" },
            { candidateId: "c", day: 1, reason: "城市阳台适合收束。" }
          ],
          arrangementReason: "结合地图候选和公开攻略证据排列。",
          skipSuggestion: "太累就跳过城市阳台。",
          weatherAlternative: "下雨改去室内展馆。"
        }) as T
    }
  });

  assert.equal(card.planningMode, "ai_amap");
  assert.equal(card.stops[0].address, "湖滨路");
  assert.equal(card.evidenceSources?.[0].sourceName, "example.com");
  assert.match(card.evidenceSummary || "", /公开攻略证据/);
  assert.match(card.sourceLabel, /web evidence/);
});

test("generateRealRouteCard continues when web evidence provider fails", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    evidenceProvider: {
      searchEvidence: async () => {
        throw new Error("exa unavailable");
      }
    }
  });

  assert.equal(card.sourceMode, "provider");
  assert.equal(card.evidenceSources?.length || 0, 0);
  assert.ok(card.providerWarnings?.some((warning) => warning.includes("公开攻略证据")));
});

test("generateRealRouteCard can arrange with configured DeepSeek provider", async () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  globalThis.fetch = (async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selectedStops: [
                { candidateId: "c", day: 1, reason: "先用开阔景观建立旅行兴奋感。" },
                { candidateId: "a", day: 1, reason: "接着安排轻松步行和拍照。" },
                { candidateId: "b", day: 1, reason: "最后用本地小吃收束。" }
              ],
              arrangementReason: "按景观、漫步、餐食收束排列。",
              skipSuggestion: "太累就跳过湖滨步行街。",
              weatherAlternative: "下雨改去室内展馆。"
            })
          }
        }
      ]
    })) as typeof fetch;

  try {
    const card = await generateRealRouteCard(request, {
      amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 }
    });

    assert.equal(card.planningMode, "ai_amap");
    assert.equal(card.stops[0].poi, "城市阳台");
    assert.equal(card.arrangementReason, "按景观、漫步、餐食收束排列。");
  } finally {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
    globalThis.fetch = originalFetch;
  }
});

test("generateRealRouteCard can arrange with configured Bailian provider", async () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalBailianKey = process.env.BAILIAN_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.AI_PROVIDER = "bailian";
  process.env.BAILIAN_API_KEY = "test-bailian-key";
  globalThis.fetch = (async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selectedStops: [
                { candidateId: "a", day: 1, reason: "先安排低负担步行，快速进入城市状态。" },
                { candidateId: "c", day: 1, reason: "中段用城市景观提升记忆点。" },
                { candidateId: "b", day: 1, reason: "最后用本地小吃收束体验。" }
              ],
              arrangementReason: "按轻松进入、景观记忆、餐食收束排列。",
              skipSuggestion: "太累就跳过城市阳台。",
              weatherAlternative: "下雨优先改去室内展馆。"
            })
          }
        }
      ]
    })) as typeof fetch;

  try {
    const card = await generateRealRouteCard(request, {
      amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 }
    });

    assert.equal(card.planningMode, "ai_amap");
    assert.equal(card.stops[0].poi, "湖滨步行街");
    assert.equal(card.arrangementReason, "按轻松进入、景观记忆、餐食收束排列。");
  } finally {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    if (originalBailianKey === undefined) delete process.env.BAILIAN_API_KEY;
    else process.env.BAILIAN_API_KEY = originalBailianKey;
    globalThis.fetch = originalFetch;
  }
});
