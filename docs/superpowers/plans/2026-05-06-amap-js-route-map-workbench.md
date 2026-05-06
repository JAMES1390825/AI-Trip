# Amap JS Route Map Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the route card's SVG-only map preview with a real in-app Amap JSAPI route workbench that keeps marker and timeline interactions inside AI Trip.

**Architecture:** Add a browser-only Amap JS loader and a `RouteInteractiveMap` client component that owns map instance lifecycle, custom markers, route polyline, fit-to-route viewport, and selected-stop details. `RouteCard` owns selected stop state and synchronizes map marker clicks with timeline button clicks, while `RouteMiniMap` remains the fallback when JSAPI credentials or browser APIs are unavailable.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Amap JSAPI 2.0 loaded by script tag, Node built-in test runner through `tsx --test`, CSS in `apps/web/app/globals.css`.

---

## File Structure

- Create `apps/web/src/components/amap-js-loader.ts`: small reusable Amap JSAPI loader with typed global window access and shared promise behavior.
- Create `apps/web/src/components/amap-js-loader.test.ts`: unit tests for missing config, promise reuse, and script load rejection.
- Create `apps/web/src/components/RouteInteractiveMap.tsx`: client-only route map workbench using Amap JSAPI when available and `RouteMiniMap` fallback otherwise.
- Create `apps/web/src/components/RouteInteractiveMap.test.tsx`: server-renderable tests for fallback and selected stop detail panel.
- Modify `apps/web/src/components/RouteMiniMap.tsx`: update copy so fallback does not say clicking opens Amap.
- Modify `apps/web/src/components/RouteMiniMap.test.tsx`: update expected fallback copy.
- Modify `apps/web/src/components/RouteCard.tsx`: own selected stop id, render `RouteInteractiveMap`, convert timeline anchors to buttons, and mark selected timeline row.
- Modify `apps/web/src/components/RouteCard.test.ts`: assert timeline rows are buttons, no Amap anchors are rendered, and first stop selection appears.
- Modify `apps/web/app/globals.css`: style the map workbench, custom marker DOM, selected stop panel, selected timeline button, and fallback state.
- Modify `docs/product/citywalk-route-cards-prd.md`: replace Amap navigation link language with in-app map workbench language.
- Modify `docs/product/citywalk-route-cards-architecture.md`: replace SVG-only preview architecture with Amap JSAPI workbench boundary.

## Task 1: Add Amap JSAPI Loader

**Files:**

- Create: `apps/web/src/components/amap-js-loader.test.ts`
- Create: `apps/web/src/components/amap-js-loader.ts`

- [ ] **Step 1: Write failing loader tests**

Create `apps/web/src/components/amap-js-loader.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  __resetAmapLoaderForTests,
  loadAmapJsApi,
  type AmapJsApiLoaderConfig,
  type AmapWindow
} from "./amap-js-loader";

function installDomStub() {
  const appended: Array<Record<string, unknown>> = [];
  const documentStub = {
    createElement(tagName: string) {
      assert.equal(tagName, "script");
      return {
        async: false,
        src: "",
        onerror: null as null | (() => void),
        onload: null as null | (() => void)
      };
    },
    head: {
      appendChild(element: Record<string, unknown>) {
        appended.push(element);
      }
    }
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub
  });

  return appended;
}

function installWindowStub(overrides: Partial<AmapWindow> = {}) {
  const windowStub: AmapWindow = {
    AMap: undefined,
    _AMapSecurityConfig: undefined,
    ...overrides
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub
  });

  return windowStub;
}

test.afterEach(() => {
  __resetAmapLoaderForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

test("loadAmapJsApi rejects when JSAPI key is missing", async () => {
  await assert.rejects(
    () => loadAmapJsApi({ apiKey: "", securityJsCode: "secret" }),
    /AMAP_JS_API_KEY_MISSING/
  );
});

test("loadAmapJsApi sets security config and reuses the same loading promise", async () => {
  const appended = installDomStub();
  const windowStub = installWindowStub();
  const config: AmapJsApiLoaderConfig = { apiKey: "test-key", securityJsCode: "test-security" };

  const first = loadAmapJsApi(config);
  const second = loadAmapJsApi(config);

  assert.equal(first, second);
  assert.equal(appended.length, 1);
  assert.deepEqual(windowStub._AMapSecurityConfig, { securityJsCode: "test-security" });

  const script = appended[0] as { onload: null | (() => void); src: string };
  assert.match(script.src, /webapi\.amap\.com\/maps\?v=2\.0/);
  assert.match(script.src, /key=test-key/);

  windowStub.AMap = { Map: class {} };
  script.onload?.();

  assert.equal(await first, windowStub.AMap);
});

test("loadAmapJsApi rejects cleanly on script load failure", async () => {
  const appended = installDomStub();
  installWindowStub();

  const promise = loadAmapJsApi({ apiKey: "test-key", securityJsCode: "test-security" });
  const script = appended[0] as { onerror: null | (() => void) };
  script.onerror?.();

  await assert.rejects(() => promise, /AMAP_JS_API_LOAD_FAILED/);
});
```

- [ ] **Step 2: Run the loader test and verify it fails for the right reason**

Run from `apps/web`:

```bash
npx tsx --test src/components/amap-js-loader.test.ts
```

Expected: FAIL because `./amap-js-loader` does not exist.

- [ ] **Step 3: Implement the loader**

Create `apps/web/src/components/amap-js-loader.ts`:

```ts
export type AmapJsApi = {
  Map: new (...args: unknown[]) => unknown;
  Marker?: new (...args: unknown[]) => unknown;
  Polyline?: new (...args: unknown[]) => unknown;
  LngLat?: new (...args: unknown[]) => unknown;
  Bounds?: new (...args: unknown[]) => unknown;
  Pixel?: new (...args: unknown[]) => unknown;
};

export type AmapWindow = Window & {
  AMap?: AmapJsApi;
  _AMapSecurityConfig?: { securityJsCode: string };
};

export type AmapJsApiLoaderConfig = {
  apiKey: string;
  securityJsCode?: string;
};

let loadingPromise: Promise<AmapJsApi> | null = null;

export function __resetAmapLoaderForTests() {
  loadingPromise = null;
}

function getBrowserWindow(): AmapWindow | null {
  if (typeof window === "undefined") return null;
  return window as AmapWindow;
}

export function loadAmapJsApi(config: AmapJsApiLoaderConfig): Promise<AmapJsApi> {
  const apiKey = config.apiKey.trim();
  const securityJsCode = config.securityJsCode?.trim();

  if (!apiKey) return Promise.reject(new Error("AMAP_JS_API_KEY_MISSING"));

  const browserWindow = getBrowserWindow();
  if (!browserWindow || typeof document === "undefined") {
    return Promise.reject(new Error("AMAP_BROWSER_UNAVAILABLE"));
  }

  if (browserWindow.AMap) return Promise.resolve(browserWindow.AMap);
  if (loadingPromise) return loadingPromise;

  if (securityJsCode) {
    browserWindow._AMapSecurityConfig = { securityJsCode };
  }

  loadingPromise = new Promise<AmapJsApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(apiKey)}`;
    script.onload = () => {
      if (browserWindow.AMap) {
        resolve(browserWindow.AMap);
        return;
      }
      loadingPromise = null;
      reject(new Error("AMAP_JS_API_NOT_READY"));
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("AMAP_JS_API_LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}
```

- [ ] **Step 4: Run loader tests and verify they pass**

Run from `apps/web`:

```bash
npx tsx --test src/components/amap-js-loader.test.ts
```

Expected: PASS for all loader tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/src/components/amap-js-loader.test.ts apps/web/src/components/amap-js-loader.ts
git commit -m "feat: add amap js api loader"
```

## Task 2: Add RouteInteractiveMap Component

**Files:**

- Create: `apps/web/src/components/RouteInteractiveMap.test.tsx`
- Create: `apps/web/src/components/RouteInteractiveMap.tsx`
- Modify: `apps/web/src/components/RouteMiniMap.tsx`
- Modify: `apps/web/src/components/RouteMiniMap.test.tsx`

- [ ] **Step 1: Write failing map component tests**

Create `apps/web/src/components/RouteInteractiveMap.test.tsx`:

```tsx
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
    })
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
    })
  );

  assert.match(markup, /当前点位/);
  assert.match(markup, /11:00/);
  assert.match(markup, /南宋御街/);
  assert.match(markup, /街区适合边走边拍。/);
});
```

In `apps/web/src/components/RouteMiniMap.test.tsx`, replace:

```ts
  assert.match(markup, /App 内路线预览 · 点击站点可打开高德/);
```

with:

```ts
  assert.match(markup, /App 内路线预览/);
  assert.doesNotMatch(markup, /点击站点可打开高德/);
```

- [ ] **Step 2: Run focused tests and verify they fail for the right reason**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteInteractiveMap.test.tsx src/components/RouteMiniMap.test.tsx
```

Expected: FAIL because `./RouteInteractiveMap` does not exist and `RouteMiniMap` still contains old Amap-opening copy.

- [ ] **Step 3: Implement the client map component and fallback copy**

Create `apps/web/src/components/RouteInteractiveMap.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteStop } from "@/domain/types";
import { loadAmapJsApi, type AmapJsApi } from "./amap-js-loader";
import { RouteMiniMap } from "./RouteMiniMap";

type RouteInteractiveMapProps = {
  stops: RouteStop[];
  selectedStopId?: string;
  onSelectStop: (stopId: string) => void;
  apiKey?: string;
  securityJsCode?: string;
};

type AmapMapInstance = {
  destroy?: () => void;
  setFitView?: (overlays?: unknown[]) => void;
  setCenter?: (center: [number, number]) => void;
  add?: (overlay: unknown | unknown[]) => void;
  remove?: (overlay: unknown | unknown[]) => void;
};

type AmapMarkerInstance = {
  on?: (eventName: string, handler: () => void) => void;
  setContent?: (content: HTMLElement) => void;
};

type ValidStop = {
  stop: RouteStop;
  index: number;
};

const defaultApiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY || "";
const defaultSecurityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE || "";

function isValidStop(stop: RouteStop): boolean {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

function validStopsFor(stops: RouteStop[]): ValidStop[] {
  return stops.map((stop, index) => ({ stop, index })).filter(({ stop }) => isValidStop(stop));
}

function selectedStopFor(stops: RouteStop[], selectedStopId?: string): RouteStop | undefined {
  return stops.find((stop) => stop.id === selectedStopId) || stops[0];
}

function createMarkerContent(order: number, name: string, selected: boolean): HTMLElement {
  const marker = document.createElement("button");
  marker.className = selected ? "map-marker map-marker--selected" : "map-marker";
  marker.type = "button";
  marker.setAttribute("aria-label", `选择第 ${order} 站 ${name}`);
  marker.innerHTML = `<span>${order}</span>`;
  return marker;
}

function renderAmapRoute(
  amap: AmapJsApi,
  map: AmapMapInstance,
  validStops: ValidStop[],
  selectedStopId: string | undefined,
  onSelectStop: (stopId: string) => void
): unknown[] {
  const overlays: unknown[] = [];
  const path = validStops.map(({ stop }) => [stop.lng, stop.lat]);

  if (path.length >= 2 && amap.Polyline) {
    overlays.push(
      new amap.Polyline({
        path,
        strokeColor: "#126b43",
        strokeOpacity: 0.92,
        strokeWeight: 6,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        zIndex: 30
      })
    );
  }

  if (amap.Marker) {
    validStops.forEach(({ stop, index }) => {
      const marker = new amap.Marker({
        position: [stop.lng, stop.lat],
        content: createMarkerContent(index + 1, stop.poi, stop.id === selectedStopId),
        offset: amap.Pixel ? new amap.Pixel(-18, -18) : undefined,
        zIndex: stop.id === selectedStopId ? 80 : 60
      }) as AmapMarkerInstance;
      marker.on?.("click", () => onSelectStop(stop.id));
      overlays.push(marker);
    });
  }

  map.add?.(overlays);
  map.setFitView?.(overlays);

  return overlays;
}

export function RouteInteractiveMap({
  stops,
  selectedStopId,
  onSelectStop,
  apiKey = defaultApiKey,
  securityJsCode = defaultSecurityJsCode
}: RouteInteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AmapMapInstance | null>(null);
  const overlaysRef = useRef<unknown[]>([]);
  const [mapStatus, setMapStatus] = useState(apiKey ? "loading" : "missing-key");
  const validStops = useMemo(() => validStopsFor(stops), [stops]);
  const selectedStop = selectedStopFor(stops, selectedStopId);

  useEffect(() => {
    if (!apiKey || !mapContainerRef.current || !validStops.length) return;
    let cancelled = false;

    loadAmapJsApi({ apiKey, securityJsCode })
      .then((amap) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new amap.Map(mapContainerRef.current, {
          zoom: 13,
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          resizeEnable: true
        }) as AmapMapInstance;
        mapRef.current = map;
        overlaysRef.current = renderAmapRoute(amap, map, validStops, selectedStopId, onSelectStop);
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("failed");
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      overlaysRef.current = [];
    };
  }, [apiKey, securityJsCode, validStops, selectedStopId, onSelectStop]);

  useEffect(() => {
    if (!selectedStop || mapStatus !== "ready") return;
    mapRef.current?.setCenter?.([selectedStop.lng, selectedStop.lat]);
  }, [mapStatus, selectedStop]);

  const showFallback = mapStatus === "missing-key" || mapStatus === "failed" || !validStops.length;

  return (
    <div className="route-map-workbench">
      <div className="route-map-canvas-shell">
        {showFallback ? (
          <div className="route-map-fallback">
            <RouteMiniMap stops={stops} />
            <p>
              {mapStatus === "failed"
                ? "地图加载失败，已切换为路线预览。"
                : mapStatus === "missing-key"
                  ? "动态地图未配置，已显示路线预览。"
                  : "暂无有效坐标，先看路线点位列表。"}
            </p>
          </div>
        ) : (
          <>
            <div className="route-amap-canvas" ref={mapContainerRef} />
            {mapStatus === "loading" ? <div className="route-map-loading">正在唤起真实地图...</div> : null}
          </>
        )}
      </div>
      {selectedStop ? (
        <aside className="route-selected-stop">
          <span>当前点位</span>
          <strong>
            {selectedStop.time} · {selectedStop.poi}
          </strong>
          {selectedStop.address ? <em>{selectedStop.address}</em> : null}
          <p>{selectedStop.reason}</p>
          <small>{selectedStop.risk}</small>
        </aside>
      ) : null}
    </div>
  );
}
```

In `apps/web/src/components/RouteMiniMap.tsx`, replace:

```tsx
      <p className="route-map-caption">App 内路线预览 · 点击站点可打开高德</p>
```

with:

```tsx
      <p className="route-map-caption">App 内路线预览 · 动态地图不可用时保留路线结构</p>
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteInteractiveMap.test.tsx src/components/RouteMiniMap.test.tsx
```

Expected: PASS for `RouteInteractiveMap` fallback/detail tests and `RouteMiniMap` copy tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/web/src/components/RouteInteractiveMap.test.tsx apps/web/src/components/RouteInteractiveMap.tsx apps/web/src/components/RouteMiniMap.tsx apps/web/src/components/RouteMiniMap.test.tsx
git commit -m "feat: add route interactive map"
```

## Task 3: Wire RouteCard Selection And Timeline Buttons

**Files:**

- Modify: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/src/components/RouteCard.tsx`

- [ ] **Step 1: Write failing RouteCard interaction assertions**

In `apps/web/src/components/RouteCard.test.ts`, replace the existing assertions:

```ts
  assert.match(markup, /App 内路线预览 · 点击站点可打开高德/);
  assert.match(markup, /route-mini-map/);
  assert.match(markup, /href="https:\/\/uri\.amap\.com\/marker/);
  assert.doesNotMatch(markup, /map-pin/);
```

with:

```ts
  assert.match(markup, /动态地图未配置，已显示路线预览。/);
  assert.match(markup, /当前点位/);
  assert.match(markup, /10:00 · 湖滨步行街/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /timeline-row timeline-row--selected/);
  assert.doesNotMatch(markup, /href="https:\/\/uri\.amap\.com\/marker/);
  assert.doesNotMatch(markup, /点击站点可打开高德/);
  assert.doesNotMatch(markup, /map-pin/);
```

- [ ] **Step 2: Run RouteCard test and verify it fails for the right reason**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteCard.test.ts
```

Expected: FAIL because `RouteCard` still renders timeline anchors and `RouteMiniMap` directly.

- [ ] **Step 3: Update RouteCard to own selection and render RouteInteractiveMap**

In `apps/web/src/components/RouteCard.tsx`, replace:

```tsx
import { RouteMiniMap } from "./RouteMiniMap";
```

with:

```tsx
import { useState } from "react";
import { RouteInteractiveMap } from "./RouteInteractiveMap";
```

At the top of `RouteCard`, after opening the function body, add:

```tsx
  const firstSelectableStopId = routeCard.stops[0]?.id;
  const [selectedStopId, setSelectedStopId] = useState(firstSelectableStopId);
  const activeStopId = selectedStopId || firstSelectableStopId;
```

Replace the map block:

```tsx
      <div className="route-map">
        <RouteMiniMap stops={routeCard.stops} />
      </div>
```

with:

```tsx
      <div className="route-map">
        <RouteInteractiveMap stops={routeCard.stops} selectedStopId={activeStopId} onSelectStop={setSelectedStopId} />
      </div>
```

Replace the timeline map:

```tsx
          {routeCard.stops.map((stop) => (
            <a className="timeline-row" href={stop.mapUrl} key={stop.id} rel="noreferrer" target="_blank">
              <span className="time">{stop.time}</span>
              <span>
                <strong>{stop.poi}</strong>
                {stop.address ? <small>{stop.address}</small> : null}
                <em>{stop.reason}</em>
              </span>
            </a>
          ))}
```

with:

```tsx
          {routeCard.stops.map((stop) => (
            <button
              className={stop.id === activeStopId ? "timeline-row timeline-row--selected" : "timeline-row"}
              key={stop.id}
              onClick={() => setSelectedStopId(stop.id)}
              type="button"
            >
              <span className="time">{stop.time}</span>
              <span>
                <strong>{stop.poi}</strong>
                {stop.address ? <small>{stop.address}</small> : null}
                <em>{stop.reason}</em>
              </span>
            </button>
          ))}
```

- [ ] **Step 4: Add `"use client"` if needed**

If `RouteCard.tsx` does not already have a client directive, add it as the first line:

```tsx
"use client";
```

This is needed because `RouteCard` now owns React state and timeline click handlers.

- [ ] **Step 5: Run focused component tests**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteCard.test.ts src/components/RouteInteractiveMap.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/web/src/components/RouteCard.test.ts apps/web/src/components/RouteCard.tsx
git commit -m "feat: keep route map interactions in app"
```

## Task 4: Style AI Trip Map Workbench

**Files:**

- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add map workbench CSS**

In `apps/web/app/globals.css`, add this after the existing `.route-map-stop-chip b` block:

```css
.route-map-workbench {
  display: grid;
  gap: 12px;
}

.route-map-canvas-shell {
  position: relative;
  min-height: 300px;
  overflow: hidden;
  border: 1px solid rgba(22, 32, 19, 0.14);
  border-radius: 26px;
  background:
    radial-gradient(circle at 18% 16%, rgba(255, 179, 64, 0.24), transparent 28%),
    linear-gradient(135deg, rgba(255, 248, 237, 0.92), rgba(218, 235, 210, 0.9));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}

.route-amap-canvas {
  width: 100%;
  height: 320px;
}

.route-map-loading {
  position: absolute;
  inset: 16px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: rgba(255, 248, 237, 0.76);
  color: var(--green);
  font-size: 13px;
  font-weight: 950;
}

.route-map-fallback {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.route-map-fallback > p {
  margin: 0;
  color: #42604a;
  font-size: 12px;
  font-weight: 950;
}

.map-marker {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 10px 24px rgba(22, 32, 19, 0.28);
  color: var(--ink);
  font-weight: 950;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

.map-marker span {
  transform: translateY(-1px);
}

.map-marker--selected {
  background: #fff8ed;
  box-shadow:
    0 0 0 5px rgba(255, 179, 64, 0.36),
    0 16px 30px rgba(22, 32, 19, 0.3);
  transform: translateY(-4px) scale(1.08);
}

.route-selected-stop {
  display: grid;
  gap: 5px;
  border: 1px solid rgba(18, 107, 67, 0.16);
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(255, 248, 237, 0.94), rgba(231, 255, 240, 0.88)),
    #fff;
  padding: 14px;
}

.route-selected-stop span {
  color: var(--green);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.route-selected-stop strong {
  font-size: 18px;
  letter-spacing: -0.03em;
}

.route-selected-stop em,
.route-selected-stop small {
  color: var(--muted);
  font-style: normal;
  line-height: 1.45;
}

.route-selected-stop p {
  margin: 2px 0;
  color: var(--ink);
  line-height: 1.5;
}
```

Replace the existing `.timeline-row` block with:

```css
.timeline-row {
  display: grid;
  grid-template-columns: 58px 1fr;
  gap: 12px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: inherit;
  padding: 9px 10px;
  text-align: left;
}

.timeline-row--selected {
  border-color: rgba(18, 107, 67, 0.22);
  background: rgba(231, 255, 240, 0.78);
}
```

- [ ] **Step 2: Run typecheck and build to validate CSS/React integration**

Run from `apps/web`:

```bash
npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit Task 4**

```bash
git add apps/web/app/globals.css
git commit -m "style: polish route map workbench"
```

## Task 5: Update Product Docs And Verify

**Files:**

- Modify: `docs/product/citywalk-route-cards-prd.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`

- [ ] **Step 1: Update PRD route map language**

In `docs/product/citywalk-route-cards-prd.md`, replace:

```md
3. Review timeline, in-app route preview, Amap navigation links, reasons, risk, and confidence.
```

with:

```md
3. Review timeline, in-app interactive map, selected-stop details, reasons, risk, and confidence.
```

Replace:

```md
13. See route stop order and relative spatial layout directly inside the route card before opening Amap.
```

with:

```md
13. Use map markers and timeline rows to select route stops inside AI Trip without leaving the app.
```

- [ ] **Step 2: Update architecture map section**

In `docs/product/citywalk-route-cards-architecture.md`, replace the entire `## In-App Route Preview` section with:

```md
## In-App Route Map Workbench

`RouteInteractiveMap` renders the route card on a real Amap JSAPI map when `NEXT_PUBLIC_AMAP_JS_API_KEY` and `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` are configured. Amap provides the map engine, tiles, drag/zoom behavior, coordinate projection, marker primitives, and polyline primitives.

AI Trip owns the product interaction layer: custom numbered markers, selected-stop state, timeline button synchronization, selected-stop details, fallback copy, and visual styling. No default route-card click sends the user to Amap.

`RouteMiniMap` remains a no-key or load-failure fallback so generated route cards, saved cards, share pages, tests, and builds continue to work without browser map credentials.
```

- [ ] **Step 3: Run documentation self-check**

Run from repo root:

```bash
rg -n "interactive map|RouteInteractiveMap|RouteMiniMap|Amap navigation links|opening Amap|点击站点可打开高德|No default route-card click" docs/product docs/superpowers/specs/2026-05-06-amap-js-route-map-workbench-design.md
```

Expected: references new route map workbench language and no stale product promise that timeline/default map click opens Amap.

- [ ] **Step 4: Run full verification**

Run from `apps/web`:

```bash
npm run verify
```

Expected: PASS for typecheck, tests, and build.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/product/citywalk-route-cards-prd.md docs/product/citywalk-route-cards-architecture.md
git commit -m "docs: document route map workbench"
```

## Task 6: Runtime Smoke Test

**Files:**

- No planned file edits.

- [ ] **Step 1: Ensure JSAPI env is visible to the web app**

Check without printing secrets:

```bash
node -e 'const fs=require("fs"); const text=fs.existsSync("apps/web/.env.local")?fs.readFileSync("apps/web/.env.local","utf8"):""; for (const key of ["NEXT_PUBLIC_AMAP_JS_API_KEY","NEXT_PUBLIC_AMAP_SECURITY_JS_CODE"]) console.log(`${key}=${text.includes(key+"=")?"PRESENT":"MISSING"}`)'
```

Expected: both values are `PRESENT` for dynamic map testing. If they are missing in `apps/web/.env.local`, the app should still show the fallback route preview.

- [ ] **Step 2: Start the app**

Run from `apps/web`:

```bash
npm run start
```

Expected: app serves on `http://localhost:3000`.

- [ ] **Step 3: Browser smoke**

Open `http://localhost:3000`, generate a Hangzhou one-day route, and verify:

- With JSAPI env present in the web app, the card shows a real draggable map.
- Numbered custom AI Trip markers appear on the map.
- The route polyline appears in green.
- Clicking a marker updates the in-app selected-stop panel.
- Clicking a timeline row updates the same selected-stop panel.
- Timeline clicks do not open Amap.
- If JSAPI env is missing or fails to load, the fallback route preview appears with no Amap-opening copy.

## Self-Review Checklist

- Spec coverage: loader, full map, custom markers, route polyline, selected-stop detail, timeline synchronization, no default Amap jump, no-key fallback, docs, and verification are all covered.
- Type consistency: `RouteStop`, `selectedStopId`, `onSelectStop`, `NEXT_PUBLIC_AMAP_JS_API_KEY`, and `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` are used consistently.
- Scope control: drag-to-reorder, route optimization from map edits, external navigation button, live geolocation, and Amap route geometry overlay remain out of scope.
