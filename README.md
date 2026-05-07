# AI Trip

AI Trip is a Node/TypeScript web full-stack MVP for C-end personal travel planning.

The product helps users turn a lightweight travel idea into an executable route workbench:

- Describe the trip in natural language.
- Pick preference chips and travel dates.
- Generate a route from real POI candidates, AI arrangement, and public web evidence.
- Review the map, daily itinerary, risks, and pre-trip checklist.
- Save, revise, and share the route as a secondary action.

## Active Runtime

- Web app: `apps/web`
- Product docs: `docs/product`

Retired from the current mainline:

- Go backend.
- Native iOS app.
- Community feed.
- Personalization learning system.
- Booking flows.

## Quick Start

```bash
cd apps/web
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
cd apps/web
npm test
npm run typecheck
npm run build
npm run verify
```

## Environment

Copy `.env.example` to `.env` at the repository root if provider keys are needed.

The app loads provider keys from the root `.env`. Do not create `apps/web/.env.local` for this project.

The MVP works without provider keys by using local fallback data. Configure `AMAP_WEB_SERVICE_KEY` for real POI candidates and walking estimates, AI provider keys for candidate-only AI arrangement, and keep `SEARCH_PROVIDER=exa` plus a real `EXA_API_KEY` in the root `.env` for public web evidence.

Required for the best launch-like local experience:

- `AMAP_WEB_SERVICE_KEY`: real POI candidates and walking estimates.
- `NEXT_PUBLIC_AMAP_JS_API_KEY`: in-app Amap JS map rendering.
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`: Amap JS security code.
- `AI_PROVIDER=bailian` plus `BAILIAN_API_KEY`, or another supported AI provider.
- `SEARCH_PROVIDER=exa` plus `EXA_API_KEY`: public web evidence.

If any provider is missing or fails, the app keeps the planning flow usable through Amap-only or local fallback behavior and shows provider warnings in the route card.

Saved route cards use a local SQLite database by default at `apps/web/.data/route-cards.sqlite`. Set `ROUTE_CARD_DATABASE_FILE` in the root `.env` to use another database file.
