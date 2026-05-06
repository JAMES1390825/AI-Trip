# In-App Route Map v1 Design

## Goal

Show the route spatially inside AI Trip instead of only showing a decorative map and linking out to Amap.

Users should be able to glance at the route card and understand:

- where the stops are relative to each other
- which order they will visit them in
- whether the route looks compact or spread out
- which stop they can still open in Amap for navigation

## Product Behavior

Replace the current decorative `route-map` pin layout with an in-app route map preview built from the route card's real stop coordinates.

The map preview shows:

1. A bounded map canvas inside the route card.
2. Numbered stop markers using the timeline order.
3. A connected route polyline between markers.
4. Stop labels for at least the first few points when space allows.
5. A small caption such as `App 内路线预览 · 点击站点可打开高德`.
6. Existing timeline links still open Amap marker URLs.

The map should render for both:

- Main planner preview.
- Saved share page, because both use `RouteCard`.

## Technical Approach

Do not integrate Amap JS SDK in v1.

Use a lightweight SVG component:

```ts
RouteMiniMap({ stops }: { stops: RouteStop[] })
```

Projection:

1. Read `lat` and `lng` from stops.
2. Compute min/max lat/lng bounds.
3. Add padding so markers do not touch edges.
4. Normalize longitude to x and latitude to y.
5. Invert y so north appears up.
6. If all points have the same lat/lng, fall back to a deterministic diagonal layout.

Rendering:

- SVG `polyline` connects normalized points.
- SVG `circle` + `text` render numbered markers.
- SVG labels render stop names for up to 4 points.
- Below/inside the map, render a stop-chip strip with stop order and names.

## Component Boundary

Create:

```text
apps/web/src/components/RouteMiniMap.tsx
apps/web/src/components/RouteMiniMap.test.tsx
```

`RouteMiniMap` should be pure and presentational. It should not fetch data, depend on browser-only APIs, or mutate route cards.

`RouteCard` imports `RouteMiniMap` and replaces the current manual marker loop inside `.route-map`.

## Styling

Keep the current card visual language:

- Warm paper background.
- Subtle grid.
- Strong numbered markers.
- Route line in green.
- Active route feel without pretending to be a full GIS map.

CSS classes:

- `.route-mini-map`
- `.route-mini-map svg`
- `.route-line`
- `.route-point`
- `.route-point-label`
- `.route-map-caption`
- `.route-map-stops`
- `.route-map-stop-chip`

## Safety And Fallback

- If there are no stops, render a calm empty state: `暂无路线点位`.
- If a stop lacks valid coordinates, ignore that point for geometry but keep the chip if it has a name.
- If fewer than 2 valid coordinate points exist, show markers without a connecting line.
- Keep Amap handoff links in the timeline unchanged.

## Out Of Scope

- Amap JS SDK.
- Pan/zoom map interactions.
- Live navigation.
- Walking route geometry from Amap directions.
- Map tiles.
- Dragging markers to reorder route.

## Testing

Add tests for:

- `RouteMiniMap` renders numbered markers and polyline for valid stops.
- `RouteMiniMap` renders fallback empty state when no stops exist.
- `RouteMiniMap` handles identical coordinates without `NaN`.
- `RouteCard` renders the in-app map caption and still includes timeline Amap links.

## Success Criteria

- Generated routes visibly show connected route points inside AI Trip.
- Users no longer interpret the map area as a fake decorative placeholder.
- Clicking timeline stops still opens Amap for navigation.
- Existing tests and build pass.
