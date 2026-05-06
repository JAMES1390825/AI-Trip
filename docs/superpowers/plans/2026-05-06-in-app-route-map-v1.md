# In-App Route Map v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the decorative route-card map with an in-app SVG route preview built from real route stop coordinates, while keeping Amap links for navigation handoff.

**Architecture:** Add a pure `RouteMiniMap` presentational component that projects `RouteStop.lat` and `RouteStop.lng` into a padded SVG canvas. `RouteCard` keeps owning route-card layout and simply renders the mini-map in the existing map slot, so the main planner preview and saved share page both upgrade through the shared component.

**Tech Stack:** Next.js App Router, React server-renderable components, TypeScript, Node built-in test runner through `tsx --test`, global CSS in `apps/web/app/globals.css`.

---

## File Structure

- Modify `apps/web/package.json`: include `.test.tsx` files in the test runner so component tests can live beside React components.
- Create `apps/web/src/components/RouteMiniMap.tsx`: pure route preview component; no fetches, no browser APIs, no route-card mutation.
- Create `apps/web/src/components/RouteMiniMap.test.tsx`: component tests for polyline rendering, empty state, invalid coordinates, and identical-coordinate fallback.
- Modify `apps/web/src/components/RouteCard.tsx`: replace the old manual `.map-pin` loop with `RouteMiniMap`.
- Modify `apps/web/src/components/RouteCard.test.ts`: assert the in-app route preview appears and Amap timeline links remain.
- Modify `apps/web/app/globals.css`: replace decorative map-pin styling with SVG mini-map styling that matches the current warm paper card language.
- Modify `docs/product/citywalk-route-cards-prd.md`: document the in-app route preview as part of route review.
- Modify `docs/product/citywalk-route-cards-architecture.md`: document the preview boundary and why Amap SDK is not in v1.
- Modify `docs/product/citywalk-route-cards-tasklist.md`: mark route mini-map preview as an active product capability.

## Task 1: Add RouteMiniMap Component With Tests

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/RouteMiniMap.test.tsx`
- Create: `apps/web/src/components/RouteMiniMap.tsx`

- [ ] **Step 1: Enable TSX tests and write failing component tests**

In `apps/web/package.json`, replace the current `test` script with:

```json
"test": "sh -c 'tsx --test $(find src app \\( -name \"*.test.ts\" -o -name \"*.test.tsx\" \\) -print)'"
```

Create `apps/web/src/components/RouteMiniMap.test.tsx`:

```tsx
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
  assert.match(markup, /App 内路线预览 · 点击站点可打开高德/);
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
```

- [ ] **Step 2: Run the new test and verify it fails for the right reason**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteMiniMap.test.tsx
```

Expected: FAIL because `./RouteMiniMap` does not exist.

- [ ] **Step 3: Implement the pure RouteMiniMap component**

Create `apps/web/src/components/RouteMiniMap.tsx`:

```tsx
import type { RouteStop } from "@/domain/types";

type IndexedStop = {
  stop: RouteStop;
  index: number;
};

type ProjectedStop = IndexedStop & {
  x: number;
  y: number;
};

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 220;
const MAP_PADDING = 34;
const MAX_VISIBLE_LABELS = 4;

function hasValidCoordinates({ stop }: IndexedStop): boolean {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

function ratioForIndex(index: number, total: number): number {
  if (total <= 1) return 0.5;
  return index / (total - 1);
}

function roundPoint(value: number): number {
  return Math.round(value * 10) / 10;
}

function projectStops(stops: RouteStop[]): ProjectedStop[] {
  const indexedStops = stops.map((stop, index) => ({ stop, index }));
  const validStops = indexedStops.filter(hasValidCoordinates);

  if (!validStops.length) return [];

  const latitudes = validStops.map(({ stop }) => stop.lat);
  const longitudes = validStops.map(({ stop }) => stop.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const sameLat = minLat === maxLat;
  const sameLng = minLng === maxLng;

  return validStops.map((item, projectedIndex) => {
    const routeRatio = ratioForIndex(projectedIndex, validStops.length);
    const xRatio = sameLng ? routeRatio : (item.stop.lng - minLng) / (maxLng - minLng);
    const yRatio = sameLat ? 1 - routeRatio : (maxLat - item.stop.lat) / (maxLat - minLat);

    return {
      ...item,
      x: MAP_PADDING + xRatio * (VIEWBOX_WIDTH - MAP_PADDING * 2),
      y: MAP_PADDING + yRatio * (VIEWBOX_HEIGHT - MAP_PADDING * 2)
    };
  });
}

export function RouteMiniMap({ stops }: { stops: RouteStop[] }) {
  const projectedStops = projectStops(stops);
  const linePoints = projectedStops.map(({ x, y }) => `${roundPoint(x)},${roundPoint(y)}`).join(" ");

  if (!stops.length) {
    return (
      <div className="route-mini-map route-mini-map--empty">
        <p>暂无路线点位</p>
      </div>
    );
  }

  return (
    <div className="route-mini-map" aria-label="App 内路线预览">
      <svg aria-label="路线点位相对位置" role="img" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
        {projectedStops.length >= 2 ? <polyline className="route-line" points={linePoints} /> : null}
        {projectedStops.map(({ stop, index, x, y }) => (
          <g key={stop.id} transform={`translate(${roundPoint(x)}, ${roundPoint(y)})`}>
            <circle className="route-point" r="15" />
            <text className="route-point-number" dominantBaseline="central" textAnchor="middle">
              {index + 1}
            </text>
          </g>
        ))}
        {projectedStops.slice(0, MAX_VISIBLE_LABELS).map(({ stop, x, y }) => (
          <text className="route-point-label" key={`${stop.id}-label`} x={roundPoint(x + 18)} y={roundPoint(y - 16)}>
            {stop.poi}
          </text>
        ))}
        {!projectedStops.length ? (
          <text className="route-empty-label" textAnchor="middle" x={VIEWBOX_WIDTH / 2} y={VIEWBOX_HEIGHT / 2}>
            暂无有效坐标
          </text>
        ) : null}
      </svg>
      <p className="route-map-caption">App 内路线预览 · 点击站点可打开高德</p>
      <div aria-label="路线站点" className="route-map-stops">
        {stops.map((stop, index) => (
          <span className="route-map-stop-chip" key={stop.id}>
            <b>{index + 1}</b>
            {stop.poi}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the component test and verify it passes**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteMiniMap.test.tsx
```

Expected: PASS with all four `RouteMiniMap` tests passing.

- [ ] **Step 5: Run the full test suite to prove `.test.tsx` is discovered**

Run from `apps/web`:

```bash
npm test
```

Expected: PASS and output includes `RouteMiniMap`.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/web/package.json apps/web/src/components/RouteMiniMap.test.tsx apps/web/src/components/RouteMiniMap.tsx
git commit -m "feat: add in-app route mini map"
```

## Task 2: Integrate Mini-Map Into RouteCard

**Files:**

- Modify: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing RouteCard integration assertions**

In `apps/web/src/components/RouteCard.test.ts`, add a second stop to the `routeCard.stops` array immediately after the existing stop:

```ts
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
    }
```

In the existing `RouteCard renders real planning explanation fields` test, add these assertions before the closing `});`:

```ts
  assert.match(markup, /App 内路线预览 · 点击站点可打开高德/);
  assert.match(markup, /route-mini-map/);
  assert.match(markup, /href="https:\/\/uri\.amap\.com\/marker/);
  assert.doesNotMatch(markup, /map-pin/);
```

- [ ] **Step 2: Run the RouteCard test and verify it fails for the right reason**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteCard.test.ts
```

Expected: FAIL because the current `RouteCard` still renders `.map-pin` and does not render the mini-map caption.

- [ ] **Step 3: Replace the decorative map loop with RouteMiniMap**

In `apps/web/src/components/RouteCard.tsx`, add this import below the type import:

```tsx
import { RouteMiniMap } from "./RouteMiniMap";
```

Replace the existing `.route-map` block:

```tsx
      <div className="route-map">
        {routeCard.stops.map((stop, index) => (
          <span
            className="map-pin"
            key={stop.id}
            style={{ left: `${18 + index * 21}%`, top: `${32 + (index % 2) * 22}%` }}
          >
            {index + 1}
          </span>
        ))}
      </div>
```

with:

```tsx
      <div className="route-map">
        <RouteMiniMap stops={routeCard.stops} />
      </div>
```

- [ ] **Step 4: Replace map CSS with mini-map styling**

In `apps/web/app/globals.css`, replace the existing `.route-map` and `.map-pin` blocks with:

```css
.route-map {
  position: relative;
  min-height: 274px;
  padding: 14px;
  background:
    radial-gradient(circle at 12% 24%, rgba(246, 183, 74, 0.34), transparent 28%),
    radial-gradient(circle at 82% 18%, rgba(113, 148, 94, 0.22), transparent 24%),
    linear-gradient(90deg, transparent 49%, rgba(48, 78, 57, 0.12) 50%, transparent 51%),
    linear-gradient(0deg, transparent 49%, rgba(48, 78, 57, 0.12) 50%, transparent 51%),
    #dcebd2;
  background-size: auto, auto, 44px 44px, 44px 44px, auto;
}

.route-mini-map {
  display: grid;
  gap: 10px;
  min-height: 246px;
}

.route-mini-map--empty {
  min-height: 190px;
  place-items: center;
  color: var(--muted);
  font-weight: 900;
}

.route-mini-map svg {
  width: 100%;
  min-height: 188px;
  overflow: visible;
}

.route-line {
  fill: none;
  stroke: #315f3d;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 5;
}

.route-point {
  fill: var(--accent);
  stroke: var(--ink);
  stroke-width: 2;
}

.route-point-number {
  fill: var(--ink);
  font-size: 13px;
  font-weight: 950;
}

.route-point-label,
.route-empty-label {
  fill: #2e4a34;
  font-size: 13px;
  font-weight: 900;
  paint-order: stroke;
  stroke: rgba(251, 241, 223, 0.82);
  stroke-linejoin: round;
  stroke-width: 4;
}

.route-map-caption {
  margin: 0;
  color: #42604a;
  font-size: 12px;
  font-weight: 950;
}

.route-map-stops {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.route-map-stop-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  border: 1px solid rgba(48, 78, 57, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #2f4b34;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 900;
}

.route-map-stop-chip b {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 11px;
}
```

- [ ] **Step 5: Run focused tests and verify they pass**

Run from `apps/web`:

```bash
npx tsx --test src/components/RouteMiniMap.test.tsx src/components/RouteCard.test.ts
```

Expected: PASS for the mini-map and card integration tests.

- [ ] **Step 6: Run typecheck to catch JSX and CSS-adjacent component mistakes**

Run from `apps/web`:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/web/src/components/RouteCard.test.ts apps/web/src/components/RouteCard.tsx apps/web/app/globals.css
git commit -m "feat: render route map inside cards"
```

## Task 3: Update Product Docs And Verify End-To-End

**Files:**

- Modify: `docs/product/citywalk-route-cards-prd.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`
- Modify: `docs/product/citywalk-route-cards-tasklist.md`

- [ ] **Step 1: Update the PRD MVP scope**

In `docs/product/citywalk-route-cards-prd.md`, replace MVP item 3:

```md
3. Review timeline, map links, reasons, risk, and confidence.
```

with:

```md
3. Review timeline, in-app route preview, Amap navigation links, reasons, risk, and confidence.
```

Add this new MVP item after the pretrip checklist item:

```md
13. See route stop order and relative spatial layout directly inside the route card before opening Amap.
```

- [ ] **Step 2: Document the route preview architecture boundary**

In `docs/product/citywalk-route-cards-architecture.md`, add this section after `## Pretrip Trust Layer` and before `## Persistence`:

```md
## In-App Route Preview

`RouteMiniMap` renders a lightweight SVG route preview from the `RouteCard.stops` coordinates. It is client-independent and can render on the server because it only uses route-card data, React markup, and CSS.

The preview shows relative stop layout and visit order inside AI Trip. It is not a full GIS map in v1: no Amap JS SDK, map tiles, pan/zoom, or walking-route geometry are loaded. Timeline stop links remain the trusted Amap handoff for navigation and live map verification.
```

- [ ] **Step 3: Update the tasklist capability list**

In `docs/product/citywalk-route-cards-tasklist.md`, add this Phase 1 item after `Add route-first Web UI.`:

```md
7. Add in-app route mini-map preview from route stop coordinates.
```

Renumber the following poster/story item to:

```md
8. Add poster/story share wrappers.
```

- [ ] **Step 4: Run product docs self-check**

Run from the repo root:

```bash
rg -n "in-app route preview|route mini-map|RouteMiniMap|Amap navigation links|App 内路线预览" docs/product docs/superpowers/specs/2026-05-06-in-app-route-map-v1-design.md
```

Expected: output references the PRD, architecture doc, tasklist, and spec.

- [ ] **Step 5: Run full verification**

Run from `apps/web`:

```bash
npm run verify
```

Expected: PASS for `typecheck`, `test`, and `build`.

- [ ] **Step 6: Commit Task 3**

```bash
git add docs/product/citywalk-route-cards-prd.md docs/product/citywalk-route-cards-architecture.md docs/product/citywalk-route-cards-tasklist.md
git commit -m "docs: document in-app route preview"
```

## Task 4: Manual Browser Smoke Test

**Files:**

- No planned file edits.

- [ ] **Step 1: Start or restart the local app**

Run from `apps/web`:

```bash
npm run start
```

Expected: the app serves on `http://localhost:3000`.

- [ ] **Step 2: Generate a route in the browser**

Open `http://localhost:3000`.

Use:

```text
城市: 杭州
主题: Easy citywalk
日期: 2026-05-10
天数: 1 日
备注: 想要轻松拍照，少走回头路
```

Expected:

- The generated card top area shows `App 内路线预览 · 点击站点可打开高德`.
- Numbered markers are connected by a green route line.
- Stop chips show the generated stop order.
- Clicking a timeline stop still opens an Amap marker URL in a new tab.
- Saving the route and opening the share page shows the same in-app route preview.

- [ ] **Step 3: Capture smoke-test result in final handoff**

Do not commit anything for this task unless the smoke test reveals a defect and a code change is made.

## Self-Review Checklist

- Spec coverage: Task 1 covers `RouteMiniMap`, coordinate projection, same-coordinate fallback, invalid coordinate behavior, empty state, numbered markers, labels, stop chips, and polyline rendering. Task 2 covers `RouteCard` integration, visual styling, and preserved Amap links. Task 3 covers product documentation. Task 4 covers browser-level user experience.
- Type consistency: The plan uses existing `RouteStop`, `RouteCard`, `lat`, `lng`, `mapUrl`, `poi`, and `sourceMode` fields from `apps/web/src/domain/types.ts`.
- Scope control: The plan intentionally excludes Amap JS SDK, map tiles, pan/zoom, live navigation, walking geometry, and marker dragging for v1.
