# Citywalk Route Cards Architecture

## Runtime

Single Node/TypeScript Web app in `apps/web`.

## Layers

1. UI: `apps/web/app` and `apps/web/src/components`.
2. API: Next.js Route Handlers in `apps/web/app/api`.
3. Domain: route themes, fallback data, planner in `apps/web/src/domain`.
4. Persistence: local JSON store in `apps/web/src/server`.

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
4. `openai-route-client` asks OpenAI for structured JSON only.
5. `route-arrangement` validates that AI selected only candidate IDs from Amap.
6. `real-route-planner` assembles a route card or falls back to the local seed planner.

OpenAI is never allowed to invent POI facts. Amap coordinates, addresses, and provider IDs remain the source of truth.

## Persistence

Local JSON file at `.data/route-cards.json` by default.
