# Amap JS Route Map Workbench Design

## Goal

Upgrade the route card from a static/SVG route preview into a real in-app interactive map powered by Amap JSAPI, while keeping AI Trip's own product UI and interaction model.

The user should feel:

- The route is visible on a real city map.
- The map belongs to AI Trip, not a copied Amap web page.
- Clicking a route point keeps them inside the app.
- Timeline and map selection stay synchronized.

## Product Position

Use Amap as the map engine, not as the product shell.

AI Trip owns:

- route marker design
- selected-stop interaction
- route detail panel
- route timeline behavior
- trust and planning copy
- fallback experience when map JS credentials are missing

Amap JSAPI owns:

- map tiles
- drag and zoom
- coordinate projection
- marker and polyline rendering primitives
- fit-to-route viewport

## User Experience

The route card map area becomes a real interactive map workbench.

Default state:

1. Load a real Amap map inside the card.
2. Fit the viewport to all valid route stops.
3. Draw a route polyline using the generated stop order.
4. Render custom numbered AI Trip markers for each stop.
5. Select the first valid stop by default.
6. Show an in-app selected-stop panel below or over the map.

Interaction:

1. Clicking a map marker selects that stop in AI Trip.
2. Clicking a timeline row selects the same stop, instead of opening Amap.
3. Selected marker becomes visually stronger.
4. Selected stop panel shows time, POI name, address, reason, risk, and order.
5. The map recenters softly on the selected stop.
6. The user is not sent to Amap by default.

Optional future action:

- A separate small "打开导航" action can be added later if the user wants external navigation. It is not part of this version.

## Visual Direction

Use a "travel field notebook + live map instrument" direction.

The map should feel practical and trustworthy, but not generic:

- warm paper card shell
- green route line
- amber numbered markers
- selected marker with ink ring and subtle lift
- compact floating detail panel
- calm status text for loading and fallback
- no default Amap marker visuals

Do not copy Amap's default UI layout. Avoid making the map look like an iframe pasted into the card.

## Technical Approach

Create a client-only map component:

```text
apps/web/src/components/RouteInteractiveMap.tsx
```

Responsibilities:

1. Load Amap JSAPI in the browser.
2. Create and destroy a map instance.
3. Render a custom marker for each valid coordinate stop.
4. Render a polyline following stop order.
5. Fit bounds to the route.
6. Track the selected stop id in React state.
7. Expose App-internal selection through marker clicks and timeline buttons.
8. Render fallback content if credentials or browser APIs are unavailable.

Keep `RouteMiniMap` as a no-key fallback.

`RouteCard` chooses:

- `RouteInteractiveMap` when `NEXT_PUBLIC_AMAP_JS_API_KEY` is available.
- `RouteMiniMap` when JSAPI key is missing or map loading fails.

## Environment

Required for dynamic in-app map:

```text
NEXT_PUBLIC_AMAP_JS_API_KEY
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE
```

The existing server-side key remains separate:

```text
AMAP_WEB_SERVICE_KEY
```

Notes:

- `AMAP_WEB_SERVICE_KEY` is for server-side POI search and walking estimates.
- `NEXT_PUBLIC_AMAP_JS_API_KEY` is for browser-side map rendering.
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` is required by modern Amap Web JSAPI keys.
- The implementation must not print or commit real key values.

## Loading Strategy

Prefer a small internal script loader instead of adding a large map wrapper library.

Loader behavior:

1. Set `window._AMapSecurityConfig.securityJsCode` before loading JSAPI.
2. Reuse an existing loading promise if multiple cards render.
3. Load Amap JSAPI 2.0 through a script tag.
4. Resolve when `window.AMap` is ready.
5. Reject with a user-friendly map status if load fails.

The component should be client-only and guarded against SSR.

## Component Boundary

Create:

```text
apps/web/src/components/amap-js-loader.ts
apps/web/src/components/RouteInteractiveMap.tsx
apps/web/src/components/RouteInteractiveMap.test.tsx
```

Modify:

```text
apps/web/src/components/RouteCard.tsx
apps/web/src/components/RouteCard.test.ts
apps/web/src/components/RouteMiniMap.tsx
apps/web/src/components/RouteMiniMap.test.tsx
apps/web/app/globals.css
.env.example
docs/product/citywalk-route-cards-prd.md
docs/product/citywalk-route-cards-architecture.md
```

## Timeline Behavior

The current timeline rows are anchor links to `stop.mapUrl`.

Change them to buttons:

```tsx
<button className="timeline-row" type="button">
```

The timeline remains keyboard-accessible.

RouteCard should own selected stop id, then pass:

- `selectedStopId`
- `onSelectStop`

to both `RouteInteractiveMap` and the timeline.

## Fallback Behavior

Fallbacks are product states, not errors.

1. Missing JSAPI key: show `RouteMiniMap` with copy explaining dynamic map is not configured.
2. JSAPI load failure: show `RouteMiniMap` and `地图加载失败，已切换为路线预览`.
3. No valid coordinates: show a calm empty state.
4. Invalid single stop coordinate: keep the timeline stop visible, but exclude it from map markers.

## Testing

Add tests for:

1. `RouteCard` renders timeline rows as buttons, not Amap anchors.
2. `RouteCard` passes selected state to the map/timeline and marks the first stop selected by default.
3. `RouteInteractiveMap` renders fallback text when no JSAPI key exists.
4. `RouteInteractiveMap` renders selected stop detail panel.
5. `amap-js-loader` reuses the same promise and rejects cleanly on script load failure.
6. Existing route generation, saving, share pages, and build still pass.

Map rendering itself can be tested through a fake `window.AMap` surface rather than loading real Amap in unit tests.

## Out Of Scope

- Dragging route markers to reorder stops.
- Full route optimization from map edits.
- External navigation button.
- Live geolocation.
- Amap driving/walking route geometry overlay.
- Multi-day layer toggles.
- Community/shared collaborative map editing.

## Success Criteria

- Route card shows a real interactive map when JSAPI credentials are configured.
- Route marker clicks update an in-app detail state.
- Timeline clicks update the same in-app selection state.
- No default click path sends the user to Amap.
- The map visually feels like AI Trip's route workbench, not a copied Amap page.
- Missing JSAPI credentials gracefully fall back to the route preview.
- `npm run verify` passes.
