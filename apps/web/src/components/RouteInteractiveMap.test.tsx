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
