import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteCard as RouteCardData } from "@/domain/types";
import { RouteCard } from "./RouteCard";

const routeCard: RouteCardData = {
  id: "card-1",
  city: "杭州",
  themeId: "classic",
  themeLabel: "经典初游路线",
  title: "杭州1日经典初游路线",
  summary: "真实路线",
  highlights: ["湖滨步行街 是路线主节点"],
  fitFor: "适合轻松拍照用户。",
  riskTips: ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"],
  sourceLabel: "Amap real map data + AI planning",
  planningMode: "ai_amap",
  intentSummary: "轻松拍照",
  blueprintSummary: "水岸与街区串联",
  arrangementReason: "先散步再收束，减少绕路。",
  skipSuggestion: "太累就跳过第二站。",
  weatherAlternative: "下雨改去室内展馆。",
  providerWarnings: ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"],
  pretripChecklist: [
    {
      id: "weather-1",
      category: "weather",
      title: "保留雨天或高温备选",
      detail: "路线包含户外步行，出发前建议确认天气。",
      severity: "warning",
      actionLabel: "查看天气"
    },
    {
      id: "traffic-1",
      category: "traffic",
      title: "这段路程可能偏长",
      detail: "湖滨步行街 到 城市阳台 预计 35 分钟。",
      severity: "info",
      actionLabel: "打开地图复核"
    }
  ],
  startDate: "2026-05-10",
  durationDays: 1,
  estimatedCostCny: 240,
  stops: [
    {
      id: "1-a",
      time: "10:00",
      poiId: "a",
      poi: "湖滨步行街",
      address: "湖滨路",
      day: 1,
      tags: ["photo"],
      lat: 30,
      lng: 120,
      mapUrl: "https://uri.amap.com/marker",
      reason: "适合拍照。",
      risk: "出发前确认。",
      sourceMode: "provider"
    }
  ],
  legs: [],
  confidence: 0.86,
  confidenceTier: "high",
  degraded: false,
  degradedReason: "",
  sourceMode: "provider",
  share: { posterTitle: "杭州", posterSubtitle: "湖滨步行街", storyTitle: "故事", storyCaption: "1 个点位" },
  createdAt: "2026-05-05T00:00:00.000Z"
};

test("RouteCard renders real planning explanation fields", () => {
  const markup = renderToStaticMarkup(React.createElement(RouteCard, { routeCard }));

  assert.match(markup, /路线构思/);
  assert.match(markup, /这样安排的原因/);
  assert.match(markup, /太累就跳过/);
  assert.match(markup, /天气变化备选/);
  assert.match(markup, /湖滨路/);
  assert.match(markup, /出发前检查/);
  assert.match(markup, /保留雨天或高温备选/);
  assert.match(markup, /查看天气/);
});
