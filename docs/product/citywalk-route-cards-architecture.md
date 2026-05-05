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

## Provider Boundary

`apps/web/src/domain/poi-provider.ts` defines the POI provider seam. The current implementation uses `fallbackPoiProvider`, which wraps local seed data and exposes a source label for user-facing trust copy. Future AMap or AI enrichment should implement this boundary instead of bypassing the planner.

## Persistence

Local JSON file at `.data/route-cards.json` by default.
