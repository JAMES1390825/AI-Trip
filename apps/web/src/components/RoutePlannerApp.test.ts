import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteStop } from "@/domain/types";
import {
  reorderedStopsToReviseNote,
  RoutePlannerApp,
  stopActionToReviseNote
} from "./RoutePlannerApp";

function routeStop(id: string, poi: string): RouteStop {
  return {
    id,
    time: "10:00",
    poiId: id,
    poi,
    address: "湖滨路",
    day: 1,
    tags: ["photo"],
    lat: 30,
    lng: 120,
    mapUrl: "https://uri.amap.com/marker",
    reason: "适合散步。",
    risk: "出发前确认。",
    sourceMode: "provider"
  };
}

test("RoutePlannerApp renders start and end date pickers instead of duration choices", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /出发日期/);
  assert.match(markup, /结束日期/);
  assert.match(markup, /系统会根据日期范围自动计算行程天数/);
  assert.doesNotMatch(markup, /<option value="1"/);
  assert.doesNotMatch(markup, /<option value="2"/);
});

test("RoutePlannerApp exposes route revision controls in the workbench", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /调整路线/);
  assert.match(markup, /少走路/);
  assert.match(markup, /加吃饭点/);
  assert.match(markup, /重新调整路线/);
});

test("RoutePlannerApp exposes light create entries and planning chips", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /我的行程/);
  assert.match(markup, /创建新计划/);
  assert.match(markup, /智能导入地点\/行程/);
  assert.match(markup, /采集识别/);
  assert.match(markup, /拍照出片/);
  assert.match(markup, /历史古迹/);
  assert.match(markup, /预算友好/);
});

test("RoutePlannerApp presents a launchable planning-first first screen", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /AI 旅行规划/);
  assert.match(markup, /真实地点/);
  assert.match(markup, /公开攻略证据/);
  assert.match(markup, /先规划，再保存和调整/);
  assert.match(markup, /高德真实地点/);
  assert.match(markup, /AI 路线编排/);
  assert.match(markup, /Exa 公开证据/);
  assert.match(markup, /异常时本地兜底/);
  assert.match(markup, /生成真实行程/);
  assert.doesNotMatch(markup, /生成路线卡/);
});

test("RoutePlannerApp keeps route templates out of the light create flow", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /点几枚旅行偏好/);
  assert.doesNotMatch(markup, /经典初游路线/);
  assert.doesNotMatch(markup, /第一次来这座城市/);
  assert.doesNotMatch(markup, /雨天备选路线/);
  assert.doesNotMatch(markup, /美食串联路线/);
});

test("RoutePlannerApp exposes create mode and chip selection state to assistive tech", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /<button(?=[^>]*aria-pressed="true")[^>]*>创建新计划<\/button>/);
  assert.match(markup, /<button(?=[^>]*aria-pressed="true")[^>]*>拍照出片<\/button>/);
  assert.match(markup, /<button(?=[^>]*disabled)(?=[^>]*(?:title|aria-label)="[^"]*即将支持)/);
});

test("RoutePlannerApp renders honest generation progress labels", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /理解旅行需求/);
  assert.match(markup, /高德搜索真实地点/);
  assert.match(markup, /Exa 检索公开攻略证据/);
  assert.match(markup, /不展示未接入来源/);
  assert.doesNotMatch(markup, /正在搜索小红书官方/);
});

test("stopActionToReviseNote maps stop actions to revise notes", () => {
  assert.equal(
    stopActionToReviseNote({ type: "replace", stopId: "a", stopName: "湖滨步行街" }),
    "替换「湖滨步行街」，保持路线真实可走。",
  );
  assert.equal(
    stopActionToReviseNote({ type: "delete", stopId: "a", stopName: "湖滨步行街" }),
    "删除「湖滨步行街」，并重新连接前后路线。",
  );
  assert.equal(
    stopActionToReviseNote({ type: "add_food_before", stopId: "a", stopName: "湖滨步行街" }),
    "在「湖滨步行街」前面加一个真实可达的吃饭点。",
  );
  assert.equal(
    stopActionToReviseNote({ type: "add_rest_after", stopId: "a", stopName: "湖滨步行街" }),
    "在「湖滨步行街」后面加一个适合休息的点。",
  );
  assert.equal(
    stopActionToReviseNote({ type: "make_indoor", stopId: "a", stopName: "湖滨步行街" }),
    "把「湖滨步行街」替换成室内或雨天更稳的点。",
  );
  assert.equal(
    stopActionToReviseNote({ type: "less_walking", stopId: "a", stopName: "湖滨步行街" }),
    "优化「湖滨步行街」附近路线，减少步行距离。",
  );
});

test("reorderedStopsToReviseNote maps ordered stops to revise note", () => {
  assert.equal(
    reorderedStopsToReviseNote([
      routeStop("a", "湖滨步行街"),
      routeStop("b", "南宋御街"),
      routeStop("c", "城市阳台")
    ]),
    "用户拖拽调整了当天顺序，请优先按这个顺序重新校验路线时间：湖滨步行街 -> 南宋御街 -> 城市阳台",
  );
});
