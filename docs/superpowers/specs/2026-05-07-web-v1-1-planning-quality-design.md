# Web V1.1 Planning Quality Design

## Goal

Improve the Web MVP from "can generate a route" to "can capture real travel constraints and explain why this route is a good plan." This version stays Web-only and builds on the launchable planning workbench.

## Product Direction

V1.1 is a larger planning-quality package:

- richer trip inputs,
- stronger intent inference,
- clearer route quality explanations,
- provider health transparency,
- better mobile Web layout.

Sharing remains secondary. Native mobile apps, accounts, booking, community, and scraping remain out of scope.

## User Problem

A user planning a real trip usually has constraints beyond city/date/chips:

- approximate budget,
- who is traveling,
- preferred transport,
- must-go places,
- places or styles to avoid,
- desired start/end area.

If the app ignores these, the route can look polished but feel generic. V1.1 should make those constraints visible, pass them through generation, and show how they influenced the result.

## Scope

### 1. Richer Create Inputs

Add an "advanced but lightweight" section to the Web planner:

- budget range,
- companion,
- transport preference,
- start/end area,
- must-go places,
- avoid places or constraints.

The UI should not become a heavy form. These fields should read like planning chips and short notes, and remain optional.

### 2. Request And Intent Model

Extend `RouteCardRequest` with:

- `budgetRange`,
- `mustVisitText`,
- `avoidText`.

The API should validate and cap these strings. The intent model should convert them into:

- budget posture,
- must-have constraints,
- avoid constraints,
- transport/companion-aware pacing.

### 3. Route Quality Explanation

Each generated route card should include a concise quality summary:

- match score,
- what constraints were satisfied,
- what tradeoffs were made,
- why some requested places or styles may be skipped,
- provider health.

This does not need a complex scoring engine. A deterministic quality summary based on request fields, route mode, evidence, legs, and warnings is enough for V1.1.

### 4. Result UI

Show the quality summary near the existing trust summary:

- "匹配度",
- "已满足",
- "取舍",
- "需要确认",
- provider health chips.

The result should make it obvious whether the plan is AI+Amap+Exa, Amap-only, or fallback.

### 5. Mobile Web Polish

The Web app should be easier to use in a phone browser:

- create inputs should stack cleanly,
- result actions should remain reachable,
- map/result cards should not require desktop width,
- large cards should use tighter spacing on small screens.

No native app or device-specific bridge is included.

## Non-Goals

- User accounts.
- Cloud persistence beyond the current SQLite store.
- Booking/payment.
- Community feed.
- Xiaohongshu scraping or unofficial APIs.
- Multi-city long-trip planner.
- Native iOS or Android.

## Architecture Notes

- Keep the current Next.js app and API routes.
- Extend existing domain types rather than adding global state.
- Add a focused route quality module if needed to keep `real-route-planner.ts` from becoming too broad.
- Keep request parsing in `app/api/route-cards/generate/route.ts`.
- Keep frontend state local to `RoutePlannerApp`.
- Keep tests in the existing Node test style.

## Acceptance Criteria

1. Planner UI exposes optional budget, companion, transport, start/end, must-go, and avoid inputs.
2. Generate API accepts and caps the new fields safely.
3. Intent inference includes budget, must-have, avoid, companion, and transport signals.
4. Generated cards include a quality summary derived from route facts and request constraints.
5. RouteCard renders match score, satisfied constraints, tradeoffs, confirmation needs, and provider health.
6. Mobile Web CSS improves single-column usability without breaking desktop.
7. Full verification passes before merge.
