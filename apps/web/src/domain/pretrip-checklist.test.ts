import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "./planner";
import { buildPretripChecklist } from "./pretrip-checklist";
import type { RouteCard } from "./types";

test("buildPretripChecklist creates weather time traffic budget and comfort items from route facts", () => {
  const card: RouteCard = {
    ...generateRouteCard({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: "想拍照"
    }),
    estimatedCostCny: 520,
    weatherAlternative: "下雨改去室内展馆。",
    stops: [
      {
        id: "1-a",
        time: "10:00",
        poiId: "a",
        poi: "湖滨步行街",
        tags: ["photo", "walkable"],
        lat: 30,
        lng: 120,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合拍照。",
        risk: "营业时间参考 09:00-17:00，出发前建议再确认。",
        sourceMode: "provider"
      },
      {
        id: "2-b",
        time: "12:20",
        poiId: "b",
        poi: "城市阳台",
        tags: ["landmark"],
        lat: 30.01,
        lng: 120.01,
        mapUrl: "https://uri.amap.com/marker",
        reason: "视野开阔。",
        risk: "出发前建议确认天气和现场开放状态。",
        sourceMode: "provider"
      },
      {
        id: "3-c",
        time: "15:00",
        poiId: "c",
        poi: "南宋御街",
        tags: ["local_food"],
        lat: 30.02,
        lng: 120.02,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合吃饭。",
        risk: "风险较低。",
        sourceMode: "provider"
      },
      {
        id: "4-d",
        time: "19:30",
        poiId: "d",
        poi: "夜景平台",
        tags: ["night"],
        lat: 30.03,
        lng: 120.03,
        mapUrl: "https://uri.amap.com/marker",
        reason: "夜间收束。",
        risk: "风险较低。",
        sourceMode: "provider"
      }
    ],
    legs: [
      { fromPoi: "湖滨步行街", toPoi: "城市阳台", minutes: 35, sourceMode: "provider" },
      { fromPoi: "城市阳台", toPoi: "南宋御街", minutes: 20, degraded: true, sourceMode: "mixed" },
      { fromPoi: "南宋御街", toPoi: "夜景平台", minutes: 18, sourceMode: "provider" }
    ]
  };

  const checklist = buildPretripChecklist(card);
  const categories = checklist.map((item) => item.category);

  assert.ok(categories.includes("weather"));
  assert.ok(categories.includes("time"));
  assert.ok(categories.includes("traffic"));
  assert.ok(categories.includes("budget"));
  assert.ok(categories.includes("comfort"));
  assert.ok(checklist.length <= 5);
  assert.ok(checklist.every((item) => item.id && item.title && item.actionLabel));
});

test("buildPretripChecklist deduplicates category title pairs", () => {
  const card = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  const checklist = buildPretripChecklist({
    ...card,
    riskTips: [...card.riskTips, ...card.riskTips],
    providerWarnings: ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"]
  });
  const keys = checklist.map((item) => `${item.category}:${item.title}`);

  assert.equal(new Set(keys).size, keys.length);
});

test("buildPretripChecklist creates weather backup item from weather alternative for indoor routes", () => {
  const card: RouteCard = {
    ...generateRouteCard({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: "想拍照"
    }),
    weatherAlternative: "下雨改去室内展馆。",
    stops: [
      {
        id: "1-a",
        time: "10:00",
        poiId: "a",
        poi: "室内展馆",
        tags: ["indoor"],
        lat: 30,
        lng: 120,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合雨天。",
        risk: "风险较低。",
        sourceMode: "provider"
      },
      {
        id: "2-b",
        time: "12:20",
        poiId: "b",
        poi: "室内书店",
        tags: ["indoor"],
        lat: 30.01,
        lng: 120.01,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合休息。",
        risk: "风险较低。",
        sourceMode: "provider"
      }
    ],
    legs: [{ fromPoi: "室内展馆", toPoi: "室内书店", minutes: 15, sourceMode: "provider" }]
  };

  const weatherItem = buildPretripChecklist(card).find((item) => item.category === "weather");

  assert.ok(weatherItem);
  assert.ok(weatherItem.detail.includes("下雨改去室内展馆。"));
});

test("buildPretripChecklist creates booking items from provider warnings or risk tips mentioning booking", () => {
  const card = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  const fromProviderWarnings = buildPretripChecklist({
    ...card,
    providerWarnings: ["热门地点可能需要预约，出发前请确认。"]
  });
  const fromRiskTips = buildPretripChecklist({
    ...card,
    riskTips: ["热门地点可能需要预约，出发前请确认。"]
  });

  assert.ok(fromProviderWarnings.some((item) => item.category === "booking"));
  assert.ok(fromRiskTips.some((item) => item.category === "booking"));
});

test("buildPretripChecklist orders checklist items by severity", () => {
  const card: RouteCard = {
    ...generateRouteCard({
      city: "杭州",
      themeId: "rain_backup",
      startDate: "2026-05-10",
      durationDays: 1,
      note: "想拍照"
    }),
    estimatedCostCny: 620,
    stops: [
      {
        id: "1-a",
        time: "10:00",
        poiId: "a",
        poi: "湖滨步行街",
        tags: ["photo", "walkable"],
        lat: 30,
        lng: 120,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合拍照。",
        risk: "营业时间参考 09:00-17:00，出发前建议再确认。",
        sourceMode: "provider"
      },
      {
        id: "2-b",
        time: "12:20",
        poiId: "b",
        poi: "城市阳台",
        tags: ["landmark"],
        lat: 30.01,
        lng: 120.01,
        mapUrl: "https://uri.amap.com/marker",
        reason: "视野开阔。",
        risk: "风险较低。",
        sourceMode: "provider"
      }
    ],
    legs: [{ fromPoi: "湖滨步行街", toPoi: "城市阳台", minutes: 20, degraded: true, sourceMode: "mixed" }],
    providerWarnings: ["热门地点可能需要预约，出发前请确认。"]
  };

  const checklist = buildPretripChecklist(card);
  const severityOrder = checklist.map((item) => item.severity);

  assert.deepEqual(severityOrder, ["critical", "critical", "warning", "warning", "info"]);
});

test("buildPretripChecklist caps more than five unique candidate items after dedupe and sort", () => {
  const card: RouteCard = {
    ...generateRouteCard({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: "想拍照"
    }),
    estimatedCostCny: 620,
    stops: [
      {
        id: "1-a",
        time: "10:00",
        poiId: "a",
        poi: "湖滨步行街",
        tags: ["photo", "walkable"],
        lat: 30,
        lng: 120,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合拍照。",
        risk: "营业时间参考 09:00-17:00，出发前建议再确认。",
        sourceMode: "provider"
      },
      {
        id: "2-b",
        time: "12:20",
        poiId: "b",
        poi: "城市阳台",
        tags: ["landmark"],
        lat: 30.01,
        lng: 120.01,
        mapUrl: "https://uri.amap.com/marker",
        reason: "视野开阔。",
        risk: "风险较低。",
        sourceMode: "provider"
      },
      {
        id: "3-c",
        time: "15:00",
        poiId: "c",
        poi: "南宋御街",
        tags: ["local_food"],
        lat: 30.02,
        lng: 120.02,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合吃饭。",
        risk: "风险较低。",
        sourceMode: "provider"
      },
      {
        id: "4-d",
        time: "19:30",
        poiId: "d",
        poi: "夜景平台",
        tags: ["night"],
        lat: 30.03,
        lng: 120.03,
        mapUrl: "https://uri.amap.com/marker",
        reason: "夜间收束。",
        risk: "风险较低。",
        sourceMode: "provider"
      }
    ],
    legs: [{ fromPoi: "湖滨步行街", toPoi: "城市阳台", minutes: 20, degraded: true, sourceMode: "mixed" }],
    providerWarnings: ["热门地点可能需要预约，出发前请确认。"]
  };

  const checklist = buildPretripChecklist({
    ...card,
    riskTips: [...card.riskTips, ...card.riskTips]
  });
  const keys = checklist.map((item) => `${item.category}:${item.title}`);

  assert.equal(checklist.length, 5);
  assert.equal(new Set(keys).size, 5);
  assert.equal(checklist.some((item) => item.category === "comfort"), false);
});
