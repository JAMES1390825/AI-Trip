# Web V1.3 App Flow Design

## Goal

Reshape AI Trip from a visible planning form into an app-like flow inspired by the reference video: "我的行程" home, lightweight create entry, transparent planning progress, and a map-plus-daily-itinerary result view.

## Product Direction

V1.3 should not add a large new backend feature. It should make the existing planning power feel like a real consumer app.

The reference video is useful because it gets four things right:

- creation starts from a simple trip home,
- inputs are lightweight and progressive,
- generation is transparent and staged,
- the output reads as a map plus daily itinerary rather than a form result.

AI Trip should learn those principles without copying the exact app.

## User Problem

Right now AI Trip can generate and revise real route cards, but the first screen still feels like a builder page. A C-end user expects:

- "Where are my trips?",
- "How do I start a new one?",
- "What is the AI doing while I wait?",
- "Where is the map and today's plan?"

V1.3 should answer those questions visually and structurally.

## Scope

### 1. My Trips Home

The default screen should lead with:

- product identity,
- "我的行程" heading,
- latest saved trips or a useful empty state,
- a prominent create button styled like a large plus action,
- a compact explanation of what generated trips include.

The full creation form should move behind a create panel state. This can remain in the same page and component.

### 2. Lightweight Create Panel

Clicking the create action should open the existing planner controls in a focused panel:

- create mode tabs: 创建新计划, 智能导入地点/行程, 采集识别 disabled,
- city and date range,
- chips,
- smart import workbench when in import mode,
- natural language and constraints.

The panel should have a clear close/back action to return to My Trips.

### 3. Live Planning Progress

Replace the static progress explainer with an active progress ledger:

- stage status should change during generation,
- stages should include queued, active, done states,
- errors should mark the current state honestly,
- when generation succeeds, all stages should show done.

This remains a UI state machine; it does not need server-sent events yet.

### 4. Result Orientation

When a route exists, the preview column should present itself as the current trip workspace:

- title should communicate "地图 + 每日行程",
- actions should prioritize save and replan,
- route card should keep map first,
- empty state should explain the post-generation workspace.

Existing `RouteCard` Day tabs, map, quality summary, checklist, and revision controls stay.

### 5. Mobile Web Feel

Mobile layout should make the product feel more like an app:

- sticky create action or create dock,
- creation panel should stack cleanly,
- result actions should stay reachable,
- saved trip cards should be easy to tap.

## Non-Goals

- Native app shell.
- Account login.
- Cloud sync.
- Background generation jobs.
- Server-sent events or websocket progress.
- Booking/reservations.
- Copying the reference app's exact visuals.

## Architecture Notes

- Keep one `RoutePlannerApp` component for now, but add small local state helpers to avoid making render logic unreadable.
- Use local UI state for create panel visibility and planning stages.
- Reuse existing saved route API and generation API.
- Do not alter route generation domain logic unless tests reveal a needed adjustment.
- Keep styling in `apps/web/app/globals.css` and preserve the existing editorial/organic visual language.

## Acceptance Criteria

1. Default static render shows "我的行程" home and a prominent create action.
2. Planner controls are available inside a create panel state.
3. Static tests cover home copy, create panel copy, and progress stage status labels.
4. During generation, UI state can mark stages active/done/error.
5. Generated result area communicates "地图 + 每日行程".
6. Saved trips remain visible on the home surface.
7. Mobile CSS supports the app-like shell.
8. Full verification passes.

## Self-Review

- Placeholder scan: no TBD or unfinished sections remain.
- Internal consistency: all scope items are frontend state/layout changes using existing APIs.
- Scope check: V1.3 is focused on app flow and does not add backend jobs, accounts, or native app work.
- Ambiguity check: progress is explicitly client-side staged UI, not real streaming.
