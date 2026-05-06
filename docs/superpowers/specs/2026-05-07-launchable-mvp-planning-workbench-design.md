# Launchable MVP Planning Workbench Design

## Goal

Make AI Trip feel like an early but usable C-end personal travel planning app, not a technical demo. The next version should prioritize the planning path: create a trip lightly, generate a real route, understand why the route was made, edit/save it, and recover gracefully when providers fail.

## Product Direction

The approved direction is **planning-first with trust cues**.

- The main path is travel planning, not sharing.
- The route card remains the core product skeleton.
- Poster/story share wrappers stay available but move behind the generated result.
- The UI should explain that planning uses Amap real POIs, AI arrangement, and Exa public web evidence when configured.
- The app must not imply it uses unavailable sources such as Xiaohongshu official APIs.

## Target User

A C-end user planning a short personal trip or citywalk. They want to describe the trip naturally, choose a few preference chips, and get a route that is concrete enough to follow.

## MVP Experience

### 1. Landing And Create Flow

The first screen should answer three questions quickly:

1. What does this app do?
2. What do I need to input?
3. Can I trust the generated plan?

The planner should keep the lightweight create pattern:

- City.
- Start date and end date.
- Preference chips.
- Natural-language note.
- Optional imported places or itinerary text.

The old theme-template mental model should not return to the primary UI. Theme inference remains internal and is derived from chips plus text.

### 2. Generation Progress

Generation should feel transparent and honest. The UI should show staged progress during a pending generation:

1. Understanding trip intent.
2. Searching real POI candidates with Amap.
3. Searching public web evidence with Exa when configured.
4. Arranging and validating the route.
5. Preparing risks and pre-trip checklist.

Stages are explanatory client states, not fake claims about exact provider completion. If generation fails, the user should see a clear error and a retry path.

### 3. Result Workbench

After generation, the result should feel like a route workbench:

- Interactive map remains prominent.
- Day tabs and the daily itinerary list remain prominent.
- The selected stop detail panel should support point actions and Amap navigation.
- The timeline should support selection and drag reorder within a day.
- Save and revise actions should be visible near the generated route, not hidden below share wrappers.

The preview empty state should become more useful than a single placeholder sentence. It should show a simple "what you will get" preview: map, day plan, source evidence, and risk checklist.

### 4. Trust And Source Cues

The app should show enough source transparency to answer "what is the AI using?" without overwhelming users.

Route cards should continue showing:

- `sourceLabel`.
- `planningMode`.
- confidence.
- evidence summary and source links.
- provider warnings.
- degraded state and reason.

The planner form should include a concise trust strip such as:

- Amap real places.
- AI route arrangement.
- Exa public web evidence.
- Local fallback when providers are unavailable.

If Exa or AI is unavailable, the app should avoid pretending. It can still generate using Amap or local fallback, with visible warnings.

### 5. Saved Trips

Saved trips should support the MVP loop:

- Save the current generated route.
- See saved route summaries.
- Reopen a saved route in the workbench.
- Delete saved routes.
- Open the share page as a secondary action.

The saved section should feel like "My Trips", not a debug list.

### 6. Error And Empty States

The launchable MVP needs user-facing recovery states:

- Invalid date range: explain current support is one to two days and point users to fix dates.
- Missing or failed providers: explain whether route uses fallback, Amap-only, or AI+Amap+evidence.
- Map load failure: keep the route mini-map and point list usable.
- Generate failure: keep inputs intact and show retry guidance.
- Save/delete failure: keep current route intact.

### 7. Launch Readiness

This version should include a light launch-readiness surface:

- Metadata should be product-facing, Chinese-first, and describe AI Trip clearly.
- README should document the one-command local run, required production env variables, and provider behavior.
- `.env.example` should remain safe to commit and not contain real keys.
- Tests should cover the new launch states and copy/structure where practical.

## Non-Goals

- Login/account system.
- Community feed.
- Booking and payments.
- Xiaohongshu scraping or unofficial private API usage.
- Mobile native app.
- Long-haul multi-city trip planning.
- Making share packaging the primary path.

## Architecture Notes

The current architecture is adequate for this MVP:

- `RoutePlannerApp` owns the create/save/revise workflow.
- `RouteCard` owns generated route presentation and itinerary workbench behavior.
- `RouteInteractiveMap` owns map rendering and selected-stop actions.
- API routes load root env through `loadRootEnv`.
- `generateRealRouteCard` composes Amap, AI arrangement, Exa evidence, and local fallback.
- SQLite remains the local saved-card store.

The implementation should avoid introducing authentication, global state libraries, or a new backend service. The next iteration should improve presentation and resilience around the existing flow.

## Acceptance Criteria

1. A new user can understand the app from the first screen without reading docs.
2. The primary CTA is generating a route, not sharing.
3. While generating, the user sees a clear staged planning progress UI.
4. Generated results prioritize map, daily itinerary, source trust, risks, and editing.
5. Share packaging is still available but secondary.
6. Missing provider or degraded generation states are honest and actionable.
7. Saved trips read like a user-facing "My Trips" section.
8. The production metadata and README support an initial deployment.
9. The full verification command passes before merging.
