# Route Card Usability Enhancement Design

## Status

Approved direction from product discussion on 2026-05-05.

## Goal

Improve the current Node Web MVP so the route-card experience feels more usable after generation:

- Saved cards can be opened and shared directly.
- Generated routes feel richer and closer to real travel planning.
- Trust information is clearer without making the card feel technical.
- Provider integration has a clean boundary, while this iteration still works with fallback data only.

## Scope

This iteration enhances the existing `apps/web` app. It does not add external map, POI, or AI API calls yet.

In scope:

- Add share/open links after saving.
- Add copyable share URL affordance in the main UI.
- Add richer card metadata: highlights, fit notes, risk tips, and source labels.
- Add a lightweight provider abstraction around fallback POI data.
- Expand deterministic planner output and tests.

Out of scope:

- Real AMap API integration.
- Real LLM generation.
- Authentication or multi-user saved lists.
- Image export or canvas rendering for share cards.

## Product Behavior

After a user generates a route card, they can save it. After save succeeds:

- The current route card stores the saved ID returned by the API.
- The preview panel shows a share-page link for that saved route.
- The saved-list item includes an "open/share" link to `/share/:id`.
- The UI exposes a copy-link button using the current origin plus `/share/:id`.

The route card should stay route-first. A/C poster and story wrappers remain secondary packaging generated from the same `RouteCard` data.

## Route Enrichment

Route output should add fields that help users judge and remember the route:

- `highlights`: 2-3 short phrases derived from selected stops and route theme.
- `fitFor`: a concise description of who this route suits.
- `riskTips`: route-level risks such as opening-hour checks, rain sensitivity, or fallback-data limitations.
- `sourceLabel`: user-facing data source text, initially "本地示例数据".

Stop-level output should remain factual and based on POI data. The planner can compose copy from known tags, opening hours, cost levels, and theme definitions, but it must not invent facts.

## Provider Boundary

Add a small domain provider boundary:

- `PoiProvider` returns supported cities and POIs for a city.
- `fallbackPoiProvider` wraps the current `fallbackPois` data.
- `generateRouteCard` uses the provider internally. The public API can remain synchronous for this iteration unless implementation shows a clear need to go async.

This makes future AMap or AI enrichment possible without rewriting UI or API contracts.

## UI Changes

Main page:

- Saved-list rows become more actionable with a `/share/:id` link.
- After saving, the current preview shows "打开分享页" and "复制分享链接".
- Status text explains whether copy succeeded or if the user needs to copy manually.

Route card:

- Add a compact metadata block below trust metrics for highlights and source label.
- Add route-level risk tips in a friendly tone.
- Keep visual hierarchy centered on map, timeline, and trust panel.

Share page:

- Continue rendering B route card plus A/C wrappers.
- Benefit automatically from richer route-card fields.

## Testing

Add and update tests for:

- Planner returns `highlights`, `fitFor`, `riskTips`, and `sourceLabel`.
- Provider boundary returns supported city POIs and cleanly falls back for unsupported cities.
- Store/API summaries expose data needed for saved-list links.
- Existing tests for theme taxonomy, planner degradation, store, and API remain green.

Manual browser verification:

- Generate a route.
- Save it.
- Open the share page from the saved list.
- Copy the share link.
- Confirm route card still reads as the main product skeleton.

## Success Criteria

- `bash scripts/dev.sh verify` passes.
- User can generate, save, open, and share-link a route from the main page.
- Route cards feel richer without introducing unverifiable POI claims.
- The code has a clear provider seam for future real map/provider work.
