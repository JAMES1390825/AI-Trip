import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteStop } from "@/domain/types";
import {
  reorderedStopsToReviseNote,
  RoutePlannerApp,
  type RoutePlannerAppProps,
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

  assert.doesNotMatch(markup, /Route Workbench/);
  assert.doesNotMatch(markup, />调整路线</);
  assert.doesNotMatch(markup, /重新调整路线/);
});

test("RoutePlannerApp exposes light create entries and planning chips", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /一句话开始规划/);
  assert.match(markup, /创建新计划/);
  assert.match(markup, /智能导入地点\/行程/);
  assert.match(markup, /采集识别/);
  assert.match(markup, /点几枚旅行偏好/);
  assert.match(markup, /拍照出片/);
  assert.match(markup, /历史古迹/);
  assert.match(markup, /预算友好/);
});

test("RoutePlannerApp exposes smart import draft controls", () => {
  const ImportPlanner = RoutePlannerApp as React.ComponentType<RoutePlannerAppProps>;
  const markup = renderToStaticMarkup(React.createElement(ImportPlanner, { initialCreateMode: "import" }));

  assert.match(markup, /识别导入内容/);
  assert.match(markup, /导入识别草稿/);
  assert.match(markup, /应用到规划表单/);
  assert.match(markup, /识别地点/);
  assert.match(markup, /识别约束/);
  assert.match(markup, /粘贴后先识别/);
});

test("RoutePlannerApp exposes lightweight real trip constraint inputs", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /可选：补充真实约束/);
  assert.match(markup, /预算范围/);
  assert.match(markup, /同行人/);
  assert.match(markup, /交通偏好/);
  assert.match(markup, /起点区域/);
  assert.match(markup, /结束区域/);
  assert.match(markup, /必去地点/);
  assert.match(markup, /想避开\/不想去/);
});

test("RoutePlannerApp presents a launchable planning-first first screen", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /AI 旅行规划/);
  assert.match(markup, /真实地点/);
  assert.match(markup, /公开攻略证据/);
  assert.match(markup, /结果、保存和调整都放在右侧工作台/);
  assert.match(markup, /高德真实地点/);
  assert.match(markup, /AI 路线编排/);
  assert.match(markup, /Exa 公开证据/);
  assert.match(markup, /异常时本地兜底/);
  assert.match(markup, /生成真实行程/);
  assert.match(markup, /你的行程结果会出现在这里/);
  assert.doesNotMatch(markup, /保存当前行程/);
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

  assert.match(markup, /创建规划任务/);
  assert.match(markup, /轮询任务结果/);
  assert.match(markup, /理解旅行需求/);
  assert.match(markup, /高德检索真实地点/);
  assert.match(markup, /Exa 查找公开攻略证据/);
  assert.match(markup, /不展示未接入来源/);
  assert.doesNotMatch(markup, /正在搜索小红书官方/);
});

test("RoutePlannerApp renders launch generation stages and retry guidance", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /规划进度流/);
  assert.match(markup, /等待开始/);
  assert.match(markup, /进行中/);
  assert.match(markup, /已完成/);
  assert.match(markup, /需确认/);
  assert.match(markup, /理解旅行需求/);
  assert.match(markup, /制定搜索策略/);
  assert.match(markup, /高德检索真实地点/);
  assert.match(markup, /Exa 查找公开攻略证据/);
  assert.match(markup, /路线架构 Agent 编排/);
  assert.match(markup, /Critic Agent 校验路线/);
  assert.match(markup, /输出地图 \+ 每日行程/);
  assert.match(markup, /如果生成失败，保留输入后直接重试/);
});

test("RoutePlannerApp empty preview explains what the user will get", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /你的行程结果会出现在这里/);
  assert.match(markup, /地图 \+ 每日行程/);
  assert.match(markup, /当前旅行工作台/);
  assert.match(markup, /生成后会出现完整旅行工作台/);
  assert.match(markup, /真实地图路线/);
  assert.match(markup, /DAY 行程卡/);
  assert.match(markup, /来源证据/);
  assert.match(markup, /风险与行前检查/);
});

test("RoutePlannerApp keeps sharing secondary to planning actions", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.doesNotMatch(markup, /保存当前行程/);
  assert.doesNotMatch(markup, /再规划一版/);
  assert.doesNotMatch(markup, /分享包装/);
  assert.doesNotMatch(markup, /分享是附属能力，先把路线规划到能出发/);
});

test("RoutePlannerApp labels saved routes as user trips", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /我的行程库/);
  assert.match(markup, /保存后会在这里形成可再次打开的旅行计划/);
  assert.doesNotMatch(markup, /已保存<\/h3>/);
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
