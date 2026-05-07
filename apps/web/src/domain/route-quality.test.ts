import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteQualitySummary } from "./route-quality";

test("buildRouteQualitySummary explains satisfied constraints and provider health", () => {
  const summary = buildRouteQualitySummary({
    request: {
      city: "杭州",
      themeId: "classic",
      startDate: "2026-06-01",
      durationDays: 1,
      note: "想拍照",
      budgetRange: "budget_friendly",
      mustVisitText: "西湖、法喜寺",
      avoidText: "不要太赶",
      companion: "family",
      transportPreference: "public_transit_ok"
    },
    planningMode: "ai_amap",
    sourceLabel: "高德真实地点 + AI 编排",
    evidenceSources: [{ title: "杭州攻略", url: "https://example.com", sourceName: "example.com", snippet: "西湖", usedFor: "context" }],
    providerWarnings: [],
    degradedLegCount: 0
  });

  assert.ok(summary.matchScore >= 80);
  assert.ok(summary.satisfied.some((item) => item.includes("预算")));
  assert.ok(summary.satisfied.some((item) => item.includes("西湖")));
  assert.ok(summary.satisfied.some((item) => item.includes("亲子")));
  assert.ok(summary.satisfied.some((item) => item.includes("公共交通")));
  assert.ok(summary.providerHealth.some((item) => item.includes("高德")));
  assert.ok(summary.providerHealth.some((item) => item.includes("Exa")));
});

test("buildRouteQualitySummary lowers confidence for degraded fallback", () => {
  const summary = buildRouteQualitySummary({
    request: {
      city: "杭州",
      themeId: "classic",
      startDate: "2026-06-01",
      durationDays: 1,
      note: "想拍照",
      mustVisitText: "西湖"
    },
    planningMode: "fallback_seed",
    sourceLabel: "本地 fallback",
    evidenceSources: [],
    providerWarnings: ["高德暂时不可用"],
    degradedLegCount: 2
  });

  assert.ok(summary.matchScore < 80);
  assert.ok(summary.confirmationNeeded.some((item) => item.includes("高德暂时不可用")));
  assert.ok(summary.providerHealth.some((item) => item.includes("本地兜底")));
});
