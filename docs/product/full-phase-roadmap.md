# Full-Phase Product Roadmap (Non-MVP)

## Context

This document reflects the direction confirmed on **2026-03-12**:

- Do not stop at MVP.
- Move directly to Phase C-level capability for routing/map integration.
- Keep conversation-first user intake.
- Prepare model integration using Aliyun Bailian.

## Product Positioning

- Product style: youthful, lightweight, strategy-guide feel.
- Core flow: chat-style intake -> executable itinerary -> partial replan -> map-assisted execution.
- Scope remains V1 single-city domestic trips, but with full-quality execution surfaces.

## Current Delivered Capability

1. Chat-style intake in web client
- Guided interview fills planner fields automatically.
- Manual advanced fields remain editable.

2. Phase C map-aware itinerary payload
- Activity blocks now include POI coordinates and Amap marker links.
- Transit legs include route metadata (`distance_meters`, `polyline`, navigation URL, coordinates).
- Itinerary now includes `map_provider`.

3. Go local planner execution path
- Local planner/replanner now runs inside `trip-api` by default.
- Execution path is unified inside `trip-api` without a separate planner service.
- Existing fallback/caching behavior retained.

4. Frontend execution UX upgrades
- POI and transit cards expose one-click Amap links.
- Optional inline Amap map preview (user-supplied JS key).
- Existing generate/replan/save/load/delete/export/feedback flows preserved.

5. Model integration readiness
- `trip-api` summary path now supports OpenAI-compatible base URL config.
- Bailian compatibility can be enabled by env vars.

## Next Product Requirements (To Discuss)

1. Conversation intelligence upgrade
- Move from scripted Q&A to model-driven requirement extraction.
- Detect ambiguity and ask clarifying follow-up.
- Persist conversation memory and convert to structured `PlanRequest`.

2. Route-aware replan optimization
- Use live route duration and closure/weather changes to auto-trigger patch suggestions.
- Show diff view: what changed, why changed, confidence impact.

3. User trust & explainability
- Every itinerary block should show recommendation rationale and map context.
- Add confidence and data-freshness indicators at block level.

4. Retention mechanics
- Pre-trip task cards and weather-triggered nudges.
- Revisit reminders linked to saved plans.

## Engineering Work Packages

1. Planner Module (inside `trip-api`)
- Add model orchestration layer for conversation-to-request extraction.
- Add provider health scoring and per-block data freshness tags.

2. Trip API
- Add conversation session API endpoints.
- Add prompt/response audit and safety controls.

3. Web
- Add chat session UI and history.
- Add before/after replan comparison surface.

4. Data & Metrics
- Add funnel events for conversation completion, map interactions, and replan diff acceptance.

## External Dependencies

1. Amap
- Web JS key for inline map rendering.
- Web service key for route/geocoding (server side).

2. Aliyun Bailian
- Compatibility endpoint + model selection.
- Throughput and cost guardrails per active user.

## Risk Notes

1. Cost risk
- Model conversation plus route APIs increase per-user spend.

2. Data quality risk
- Live map/weather/opening data drift can reduce itinerary reliability.

3. Complexity risk
- Full-phase path requires tighter product/engineering sync than MVP.

