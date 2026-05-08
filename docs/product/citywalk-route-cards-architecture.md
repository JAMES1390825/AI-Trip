# Citywalk Route Cards Architecture

## Runtime

Current implementation: single Node/TypeScript Web app in `apps/web`.

Target product architecture: mature Node/TypeScript travel planning platform
with PostgreSQL, Redis, Milvus, RocketMQ, and LangGraph workers. The project is
no longer designed as an MVP-only local app. See
`docs/superpowers/specs/2026-05-07-production-agent-platform-design.md`.

## Layers

1. UI: `apps/web/app` and `apps/web/src/components`.
2. API: Next.js Route Handlers in `apps/web/app/api`.
3. Domain: route themes, fallback data, planner in `apps/web/src/domain`.
4. Persistence: PostgreSQL through Prisma with normalized itinerary, POI,
   evidence, planning job, and trace tables.
5. Async planning: target RocketMQ-based planning jobs consumed by worker
   processes.
6. Retrieval memory: target Milvus vector collections for evidence,
   POI semantics, user memory, and itinerary recall.
7. Cache and progress plane: target Redis for provider caches, short-lived
   idempotency, rate limits, and planning progress snapshots.

## Planning Model

The current implementation uses data and rules first:

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
5. `openai-route-client` uses OpenAI Responses structured output when
   `AI_PROVIDER=openai`.
6. `deepseek-route-client` uses DeepSeek Chat Completions JSON Output when
   `AI_PROVIDER=deepseek`.
7. `bailian-route-client` uses Alibaba Cloud Bailian OpenAI-compatible JSON
   Output when `AI_PROVIDER=bailian`.
8. `route-arrangement` validates that AI selected only candidate IDs from Amap.
9. `real-route-planner` assembles a route card or falls back to the local seed planner.

AI providers are never allowed to invent POI facts. Amap coordinates,
addresses, and provider IDs remain the source of truth.

## Web Evidence Boundary

`web-evidence-provider` is optional and server-side only.

The first provider is Exa Search. It searches public web pages for travel
guide context, warnings, reservation hints, seasonal notes, and source links.

Evidence is attached to route cards as `evidenceSummary` and `evidenceSources`.
It supports explanation and risk assessment but cannot create POIs, change
coordinates, or override Amap addresses.

If Exa is not configured or fails, planning continues with Amap facts and
AI/rule arrangement.

## Route Revision Workbench

The revision flow is a thin layer over the same planning pipeline:

1. The client sends the current `routeCard` plus `reviseNote` to `POST /api/route-cards/revise`.
2. `route-revision` builds an enriched planning note with the original intent,
   current stop names, and the user's requested change.
3. `real-route-planner` runs again against Amap candidates and the configured
   AI provider.
4. The response is a new route card annotated with `revisionNote` and
   `revisionSummary`.

This keeps the product closer to a route workbench than a chat transcript:
users can keep improving the active card, then save the version they prefer.

## Pretrip Trust Layer

`pretrip-checklist` derives read-only departure checks from the route card
itself. It does not call live weather, booking, or opening-hours services in
v1. The checklist is stored as part of the route card JSON, so saved routes and
share pages preserve the same trust layer.

## In-App Route Map Workbench

`RouteInteractiveMap` renders the route card on a real Amap JSAPI map when
`NEXT_PUBLIC_AMAP_JS_API_KEY` and `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` are
configured. Amap provides the map engine, tiles, drag/zoom behavior, coordinate
projection, marker primitives, and polyline primitives.

AI Trip owns the product interaction layer: custom numbered markers,
selected-stop state, timeline button synchronization, selected-stop details,
fallback copy, and visual styling. No default route-card click sends the user
to Amap.

`RouteMiniMap` remains a no-key or load-failure fallback so generated route
cards, saved cards, share pages, tests, and builds continue to work without
browser map credentials.

## Production Platform Direction

Production platform V1 now adds concrete engineering boundaries:

- `docker-compose.yml` runs PostgreSQL, Redis, RocketMQ, and Milvus locally.
- `apps/web/prisma/schema.prisma` defines the normalized production data model.
- `production-env` centralizes typed service configuration from the root env.
- `redis-cache` provides JSON cache operations with namespaced keys and TTL.
- `vector-store` provides Milvus upsert/search while preserving PostgreSQL refs.
- `planning-queue` publishes typed RocketMQ planning job events.
- `route-card-store` and `postgres-route-card-store` persist saved route cards
  through Prisma/PostgreSQL on the runtime path.

The next mainline architecture is:

- PostgreSQL for business truth: trips, route cards, POI snapshots, evidence
  sources, planning jobs, agent trace events, and user memory records.
- Redis for provider caches, progress snapshots, short-lived idempotency keys,
  rate limits, and locks.
- Milvus for mature vector retrieval: evidence chunks, POI semantic profiles,
  user preference memory, and similar itinerary recall.
- RocketMQ for planning job dispatch, retries, delayed repair tasks,
  evidence ingestion, and domain events.
- LangGraph for multi-agent planning orchestration in worker processes.

Kafka can be introduced later for clickstream, analytics, event lake ingestion,
or recommendation pipelines. RabbitMQ remains a valid alternative, but
RocketMQ is the preferred first production MQ because the current product stack
is China-travel-oriented and already integrates with Amap and Alibaba Cloud
Bailian.
