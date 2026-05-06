import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteStop } from "@/domain/types";
import { RouteInteractiveMap } from "./RouteInteractiveMap";

function routeStop(overrides: Partial<RouteStop>): RouteStop {
  return {
    id: "stop-1",
    time: "10:00",
    poiId: "poi-1",
    poi: "湖滨步行街",
    address: "湖滨路",
    day: 1,
    tags: ["photo"],
    lat: 30,
    lng: 120,
    mapUrl: "https://uri.amap.com/marker",
    reason: "适合散步。",
    risk: "出发前确认。",
    sourceMode: "provider",
    ...overrides
  };
}

test("RouteInteractiveMap renders no-key fallback without opening Amap copy", () => {
  const stops = [routeStop({ id: "a", poi: "湖滨步行街" })];
  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "a",
      onSelectStop: () => undefined,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /动态地图未配置/);
  assert.match(markup, /route-mini-map/);
  assert.doesNotMatch(markup, /点击站点可打开高德/);
});

test("RouteInteractiveMap renders selected stop detail panel", () => {
  const stops = [
    routeStop({ id: "a", poi: "湖滨步行街", time: "10:00", reason: "先从湖边慢慢进入城市节奏。" }),
    routeStop({ id: "b", poi: "南宋御街", time: "11:00", reason: "街区适合边走边拍。" })
  ];

  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "b",
      onSelectStop: () => undefined,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /当前点位/);
  assert.match(markup, /11:00 · 南宋御街/);
  assert.match(markup, /街区适合边走边拍。/);
});

test("RouteInteractiveMap renders stop edit actions when provided", () => {
  const stops = [routeStop({ id: "a", poi: "湖滨步行街" })];
  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "a",
      onSelectStop: () => undefined,
      onStopAction: () => undefined,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /替换这个点/);
  assert.match(markup, /删除这个点/);
  assert.match(markup, /前面加吃饭点/);
  assert.match(markup, /后面加休息点/);
  assert.match(markup, /改室内/);
  assert.match(markup, /这一段少走路/);
  assert.match(markup, /type="button"/);
});

test("RouteInteractiveMap disables stop edit actions while planner is pending", () => {
  const stops = [routeStop({ id: "a", poi: "湖滨步行街" })];
  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "a",
      onSelectStop: () => undefined,
      onStopAction: () => undefined,
      actionsDisabled: true,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /<button disabled=""/);
  assert.match(markup, /替换这个点/);
});

test("RouteInteractiveMap always renders Amap navigation for selected stop", () => {
  const stops = [routeStop({ id: "a", poi: "湖滨步行街", mapUrl: "https://uri.amap.com/marker?name=hubin" })];
  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "a",
      onSelectStop: () => undefined,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /导航方式/);
  assert.match(markup, /高德导航/);
  assert.match(markup, /href="https:\/\/uri\.amap\.com\/marker\?name=hubin"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noreferrer"/);
});

test("RouteInteractiveMap suppresses unsafe selected stop navigation urls", () => {
  const stops = [routeStop({ id: "a", poi: "湖滨步行街", mapUrl: "javascript:alert(1)" })];
  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "a",
      onSelectStop: () => undefined,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /导航链接待确认/);
  assert.doesNotMatch(markup, /javascript:alert/);
  assert.doesNotMatch(markup, /高德导航/);
});
