# AI Trip

AI Trip is a Node/TypeScript AI travel planning product for C-end personal
travel.

The product helps users turn a lightweight travel idea into an executable route workbench:

- Describe the trip in natural language.
- Pick preference chips and travel dates.
- Generate a route from real POI candidates, AI arrangement, and public web evidence.
- Review the map, daily itinerary, risks, and pre-trip checklist.
- Save, revise, and share the route as a secondary action.

## Active Runtime

- Web app: `apps/web`
- Product docs: `docs/product`
- Production platform base: PostgreSQL, Redis, Milvus, RocketMQ, LangGraph

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

Infrastructure boundary verification:

```bash
cd apps/web
npm run db:generate
npm run verify:infra
```

## Local Production Platform

The production backend direction is not SQLite or local files. The local stack
now includes PostgreSQL, Redis, RocketMQ, and Milvus so planning workers,
retrieval memory, provider caches, and durable job traces can be developed
against real middleware.

Start the platform services:

```bash
docker compose up -d postgres redis rocketmq-namesrv rocketmq-broker rocketmq-proxy milvus-standalone
```

Generate the Prisma client:

```bash
cd apps/web
npm run db:generate
```

Push the schema to a local PostgreSQL database when you want to inspect tables:

```bash
cd apps/web
npm run db:push
```

## Environment

Copy `.env.example` to `.env` at the repository root if provider keys are needed.

The app loads provider keys from the root `.env`. Do not create `apps/web/.env.local` for this project.

The app still works without provider keys by using local fallback data.
Configure `AMAP_WEB_SERVICE_KEY` for real POI candidates and walking estimates,
AI provider keys for candidate-only AI arrangement, and keep
`SEARCH_PROVIDER=exa` plus a real `EXA_API_KEY` in the root `.env` for public
web evidence.

Required for the best launch-like local experience:

- `AMAP_WEB_SERVICE_KEY`: real POI candidates and walking estimates.
- `NEXT_PUBLIC_AMAP_JS_API_KEY`: in-app Amap JS map rendering.
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`: Amap JS security code.
- `AI_PROVIDER=bailian` plus `BAILIAN_API_KEY`, or another supported AI provider.
- `SEARCH_PROVIDER=exa` plus `EXA_API_KEY`: public web evidence.

If any provider is missing or fails, the app keeps the planning flow usable
through Amap-only or local fallback behavior and shows provider warnings in the
route card.

Saved route cards are persisted through PostgreSQL. Run `npm run db:generate`
and `npm run db:push` before using route-card persistence against a fresh local
database.

The production planning entrypoint is `POST /api/planning-jobs`. It creates a
queued planning job in PostgreSQL and publishes a `planning.job.created`
RocketMQ event. `GET /api/planning-jobs/:id` returns the durable job status for
polling and worker progress UI. The web app can pass `runImmediately: true`
for local fallback execution; production workers can run a specific job with:

```bash
cd apps/web
npm run worker:planning -- <planning-job-id>
```
