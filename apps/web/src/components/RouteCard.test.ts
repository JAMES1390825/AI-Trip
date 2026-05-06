import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteCard as RouteCardData } from "@/domain/types";
import { RouteCard, stopsForRevalidation } from "./RouteCard";

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
  evidenceSummary: "公开攻略证据：example.com《杭州拍照路线》",
  evidenceSources: [
    {
      title: "杭州拍照路线",
      sourceName: "example.com",
      url: "https://example.com/hangzhou",
      snippet: "公开攻略证据支持湖滨步行街与江景串联。",
      usedFor: "reason"
    }
  ],
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
    },
    {
      id: "1-b",
      time: "11:00",
      poiId: "b",
      poi: "城市阳台",
      address: "之江路",
      day: 1,
      tags: ["landmark"],
      lat: 30.02,
      lng: 120.02,
      mapUrl: "https://uri.amap.com/marker?position=120.02,30.02&name=%E5%9F%8E%E5%B8%82%E9%98%B3%E5%8F%B0",
      reason: "适合看江景。",
      risk: "出发前确认。",
      sourceMode: "provider"
    },
    {
      id: "2-a",
      time: "09:30",
      poiId: "c",
      poi: "南宋御街",
      address: "中山中路",
      day: 2,
      tags: ["food"],
      lat: 30.01,
      lng: 120.01,
      mapUrl: "https://uri.amap.com/marker?position=120.01,30.01&name=%E5%8D%97%E5%AE%8B%E5%BE%A1%E8%A1%97",
      reason: "适合慢逛吃点心。",
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
  assert.match(markup, /总览/);
  assert.match(markup, /DAY1/);
  assert.match(markup, /DAY2/);
  assert.match(markup, /每日行程/);
  assert.match(markup, /公开攻略证据/);
  assert.match(markup, /example\.com/);
  assert.match(markup, /湖滨路/);
  assert.match(markup, /出发前检查/);
  assert.match(markup, /天气风险/);
  assert.match(markup, /保留雨天或高温备选/);
  assert.match(markup, /查看天气/);
  assert.match(markup, /pretrip-item pretrip-item--warning/);
  assert.doesNotMatch(markup, /pretrip-item warning/);
  assert.match(markup, /动态地图未配置，已显示路线预览。/);
  assert.match(markup, /当前点位/);
  assert.match(markup, /10:00 · 湖滨步行街/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /timeline-row timeline-row--selected/);
  assert.match(markup, /导航方式/);
  assert.match(markup, /高德导航/);
  assert.match(markup, /href="https:\/\/uri\.amap\.com\/marker/);
  assert.doesNotMatch(markup, /点击站点可打开高德/);
  assert.doesNotMatch(markup, /map-pin/);
});

test("RouteCard renders launch trust summary above route details", () => {
  const markup = renderToStaticMarkup(React.createElement(RouteCard, { routeCard }));

  assert.match(markup, /路线可信摘要/);
  assert.match(markup, /来源/);
  assert.match(markup, /Amap real map data \+ AI planning/);
  assert.match(markup, /公开证据/);
  assert.match(markup, /行前检查/);
});

test("RouteCard makes degraded plans explicit and actionable", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RouteCard, {
      routeCard: {
        ...routeCard,
        degraded: true,
        degradedReason: "Amap provider unavailable; used local fallback data.",
        sourceLabel: "Local fallback data"
      }
    })
  );

  assert.match(markup, /当前为可体验草案/);
  assert.match(markup, /Amap provider unavailable/);
  assert.match(markup, /出发前请复核真实地点和营业时间/);
});

test("RouteCard renders stop edit actions when callback is provided", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RouteCard, {
      routeCard,
      onStopAction: () => undefined
    }),
  );

  assert.match(markup, /替换这个点/);
  assert.match(markup, /删除这个点/);
  assert.match(markup, /前面加吃饭点/);
  assert.match(markup, /后面加休息点/);
  assert.match(markup, /改室内/);
  assert.match(markup, /这一段少走路/);
});

test("RouteCard forwards disabled state to stop action controls", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RouteCard, {
      routeCard,
      onStopAction: () => undefined,
      actionsDisabled: true
    }),
  );

  assert.match(markup, /<button disabled=""/);
  assert.match(markup, /替换这个点/);
});

test("RouteCard does not render unsafe evidence links", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RouteCard, {
      routeCard: {
        ...routeCard,
        evidenceSources: [
          {
            title: "不安全来源",
            sourceName: "bad",
            url: "javascript:alert(1)",
            snippet: "不应渲染。",
            usedFor: "risk"
          },
          {
            title: "安全来源",
            sourceName: "example.com",
            url: "https://example.com/safe",
            snippet: "可以渲染。",
            usedFor: "reason"
          }
        ]
      }
    })
  );

  assert.doesNotMatch(markup, /javascript:alert/);
  assert.doesNotMatch(markup, /不安全来源/);
  assert.match(markup, /https:\/\/example\.com\/safe/);
  assert.match(markup, /安全来源/);
});

test("stopsForRevalidation keeps reordered checks scoped to the active day", () => {
  const dayOneStops = stopsForRevalidation(routeCard.stops, 1);

  assert.deepEqual(dayOneStops.map((stop) => stop.poi), ["湖滨步行街", "城市阳台"]);
  assert.doesNotMatch(dayOneStops.map((stop) => stop.poi).join(" -> "), /南宋御街/);
});
