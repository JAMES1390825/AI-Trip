# Citywalk Route Cards Architecture

## Runtime

Single Node/TypeScript Web app in `apps/web`.

## Layers

1. UI: `apps/web/app` and `apps/web/src/components`.
2. API: Next.js Route Handlers in `apps/web/app/api`.
3. Domain: route themes, fallback data, planner in `apps/web/src/domain`.
4. Persistence: local SQLite store in `apps/web/src/server`.

## Planning Model

The MVP uses data and rules first:

- Fallback POI seed data defines available facts.
- Theme catalog defines planning intent.
- Planner scores and orders POIs.
- AI/provider integrations can enrich later, but the model must not invent facts.

## Provider And AI Boundary

The real planner is server-side only.

1. `user-intent` structures user preference from theme and note.
2. `route-blueprint` turns intent into abstract search slots.
3. `amap-client` resolves slots into real POI candidates and walking times.
4. `route-ai-client` selects the configured AI provider.
5. `openai-route-client` uses OpenAI Responses structured output when `AI_PROVIDER=openai`.
6. `deepseek-route-client` uses DeepSeek Chat Completions JSON Output when `AI_PROVIDER=deepseek`.
7. `bailian-route-client` uses Alibaba Cloud Bailian OpenAI-compatible JSON Output when `AI_PROVIDER=bailian`.
8. `route-arrangement` validates that AI selected only candidate IDs from Amap.
9. `real-route-planner` assembles a route card or falls back to the local seed planner.

AI providers are never allowed to invent POI facts. Amap coordinates, addresses, and provider IDs remain the source of truth.

## Web Evidence Boundary

`web-evidence-provider` is optional and server-side only.

The first provider is Exa Search. It searches public web pages for travel guide context, warnings, reservation hints, seasonal notes, and source links.

Evidence is attached to route cards as `evidenceSummary` and `evidenceSources`. It supports explanation and risk assessment but cannot create POIs, change coordinates, or override Amap addresses.

If Exa is not configured or fails, planning continues with Amap facts and AI/rule arrangement.

## Route Revision Workbench

The revision flow is a thin layer over the same planning pipeline:

1. The client sends the current `routeCard` plus `reviseNote` to `POST /api/route-cards/revise`.
2. `route-revision` builds an enriched planning note with the original intent, current stop names, and the user's requested change.
3. `real-route-planner` runs again against Amap candidates and the configured AI provider.
4. The response is a new route card annotated with `revisionNote` and `revisionSummary`.

This keeps the product closer to a route workbench than a chat transcript: users can keep improving the active card, then save the version they prefer.

## Pretrip Trust Layer

`pretrip-checklist` derives read-only departure checks from the route card itself. It does not call live weather, booking, or opening-hours services in v1. The checklist is stored as part of the route card JSON, so saved routes and share pages preserve the same trust layer.

## In-App Route Map Workbench

`RouteInteractiveMap` renders the route card on a real Amap JSAPI map when `NEXT_PUBLIC_AMAP_JS_API_KEY` and `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` are configured. Amap provides the map engine, tiles, drag/zoom behavior, coordinate projection, marker primitives, and polyline primitives.

AI Trip owns the product interaction layer: custom numbered markers, selected-stop state, timeline button synchronization, selected-stop details, fallback copy, and visual styling. No default route-card click sends the user to Amap.

`RouteMiniMap` remains a no-key or load-failure fallback so generated route cards, saved cards, share pages, tests, and builds continue to work without browser map credentials.

## Persistence

Local SQLite database at `.data/route-cards.sqlite` by default.
