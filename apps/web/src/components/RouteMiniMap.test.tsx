import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RouteStop } from "@/domain/types";
import { RouteMiniMap } from "./RouteMiniMap";

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

test("RouteMiniMap renders numbered markers and a connected route line", () => {
  const stops = [
    routeStop({ id: "a", poi: "湖滨步行街", lat: 30.251, lng: 120.164 }),
    routeStop({ id: "b", poi: "南宋御街", lat: 30.242, lng: 120.171 }),
    routeStop({ id: "c", poi: "城市阳台", lat: 30.245, lng: 120.214 })
  ];

  const markup = renderToStaticMarkup(React.createElement(RouteMiniMap, { stops }));

  assert.match(markup, /route-mini-map/);
  assert.match(markup, /App 内路线预览/);
  assert.doesNotMatch(markup, /点击站点可打开高德/);
  assert.match(markup, /class="route-line"/);
  assert.match(markup, /points="[0-9., ]+"/);
  assert.match(markup, />1</);
  assert.match(markup, />2</);
  assert.match(markup, />3</);
  assert.match(markup, /湖滨步行街/);
  assert.match(markup, /南宋御街/);
  assert.match(markup, /城市阳台/);
});

test("RouteMiniMap renders a calm empty state when no stops exist", () => {
  const markup = renderToStaticMarkup(React.createElement(RouteMiniMap, { stops: [] }));

  assert.match(markup, /暂无路线点位/);
  assert.doesNotMatch(markup, /class="route-line"/);
});

test("RouteMiniMap handles identical coordinates without NaN", () => {
  const stops = [
    routeStop({ id: "a", poi: "入口", lat: 30.25, lng: 120.16 }),
    routeStop({ id: "b", poi: "出口", lat: 30.25, lng: 120.16 })
  ];

  const markup = renderToStaticMarkup(React.createElement(RouteMiniMap, { stops }));

  assert.doesNotMatch(markup, /NaN/);
  assert.match(markup, /class="route-line"/);
  assert.match(markup, />1</);
  assert.match(markup, />2</);
});

test("RouteMiniMap ignores invalid coordinates for geometry but keeps stop chips", () => {
  const stops = [
    routeStop({ id: "a", poi: "有效点", lat: 30.25, lng: 120.16 }),
    routeStop({ id: "b", poi: "坐标待确认", lat: Number.NaN, lng: Number.NaN })
  ];

  const markup = renderToStaticMarkup(React.createElement(RouteMiniMap, { stops }));

  assert.doesNotMatch(markup, /NaN/);
  assert.doesNotMatch(markup, /class="route-line"/);
  assert.match(markup, /有效点/);
  assert.match(markup, /坐标待确认/);
});
