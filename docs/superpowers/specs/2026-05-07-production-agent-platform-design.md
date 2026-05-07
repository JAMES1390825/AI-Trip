# Production Agent Platform Design

## Goal

Upgrade AI Trip from a launchable web prototype into a mature AI travel
planning product backend.

The system should support long-running multi-agent planning, reliable data
persistence, reusable travel memory, source-grounded retrieval, and operational
observability.

This is not an MVP architecture. SQLite, local files, and lightweight
in-process job queues are no longer the target direction.

## Product Standard

AI Trip is moving toward a real C-end personal travel planning product.
The platform must be able to:

- run planning jobs asynchronously without blocking the browser request,
- preserve every generated itinerary and every agent decision trace,
- retrieve prior user preferences and public travel evidence semantically,
- cache expensive provider calls without corrupting source-of-truth data,
- retry failed provider work safely,
- support future multi-service split without rewriting the planning domain,
- make hallucination control and evidence provenance first-class backend concepts.

The product should feel fast to the user, but the backend should be honest and
durable. If Amap, Exa, a model provider, Milvus, or RocketMQ is degraded, the
app should show traceable degraded states rather than silently pretending
everything worked.

## Target Architecture

Use this as the next backend mainline:

```mermaid
flowchart LR
  UI["Next.js Web App"] --> API["Planning API"]
  API --> PG["PostgreSQL"]
  API --> Redis["Redis"]
  API --> MQ["RocketMQ"]
  MQ --> Worker["Planning Worker"]
  Worker --> Graph["LangGraph Multi-Agent Brain"]
  Graph --> Amap["Amap Tools"]
  Graph --> Exa["Exa / Web Evidence Tools"]
  Graph --> LLM["OpenAI / DeepSeek / Bailian"]
  Graph --> Milvus["Milvus Vector Memory"]
  Worker --> PG
  Worker --> Redis
  Worker --> MQ
```

### PostgreSQL

PostgreSQL becomes the primary business database.

Responsibilities:

- users and anonymous device sessions,
- trips and itinerary versions,
- route cards,
- POI snapshots resolved from Amap,
- public evidence snapshots,
- planning jobs,
- agent run records,
- agent trace events,
- source provenance and provider warning records,
- saved plans, revisions, and share metadata.

PostgreSQL owns durable business truth. Milvus must never be the only place
that stores a user itinerary, a POI identity, or a public evidence URL.

### Redis

Redis is a supporting data plane, not the business database.

Responsibilities:

- hot provider response cache,
- Amap POI search cache,
- Amap walking route cache,
- Exa query cache,
- planning progress read models,
- short-lived idempotency keys,
- rate limiting,
- distributed locks for provider-heavy jobs.

Redis data can be rebuilt. No permanent itinerary data should depend on Redis surviving.

### Milvus

Milvus is the mature vector retrieval and long-memory layer.

Responsibilities:

- public travel evidence embeddings,
- POI semantic profiles,
- city and neighborhood travel knowledge chunks,
- user preference memory,
- historical itinerary summaries,
- negative feedback and avoidance memory,
- similar-trip recall for future planning.

Milvus stores vectors plus minimal metadata needed for filtering and retrieval.
Full records stay in PostgreSQL. Every Milvus entity should have a stable
PostgreSQL reference such as `evidence_id`, `poi_snapshot_id`, `trip_id`,
or `user_memory_id`.

Initial collections:

- `travel_evidence_chunks`: guide evidence, search snippets, reservation
  hints, seasonal warnings.
- `poi_semantic_profiles`: Amap-backed POI descriptions, tags, area hints,
  suitable scenarios.
- `user_travel_memories`: durable preference summaries derived from user
  choices and revisions.
- `itinerary_summaries`: generated route summaries for similar-plan recall.

### RocketMQ

RocketMQ becomes the production message backbone for planning jobs and agent events.

Responsibilities:

- planning job dispatch,
- provider subtask dispatch when needed,
- retryable failed-agent events,
- delayed repair or refresh tasks,
- evidence ingestion events,
- itinerary revision events,
- analytics-friendly domain events.

RocketMQ is preferred over BullMQ because the target is a mature product
backend, not a lightweight Node-only queue. It is preferred over Kafka for the
first production planning workflow because the current need is reliable
business task messaging, retries, delayed jobs, and clear operational
semantics rather than high-throughput event-stream analytics.

Kafka can be introduced later for behavior analytics, event lake ingestion,
recommendation training data, or large-scale clickstream processing. RabbitMQ
remains a valid alternative, but RocketMQ fits the domestic travel stack and
likely Aliyun deployment direction better.

### LangGraph

LangGraph remains the multi-agent planning brain.

It should no longer be invoked only as an in-request helper. The target
execution model is:

1. API creates a planning job in PostgreSQL.
2. API publishes `planning.job.created` to RocketMQ.
3. Worker consumes the job.
4. Worker runs the LangGraph planning brain.
5. Each graph node writes trace events to PostgreSQL and progress snapshots to Redis.
6. Worker stores final itinerary versions in PostgreSQL.
7. API streams or polls job progress for the web client.

Agent nodes should use typed tools rather than uncontrolled arbitrary tool
calls. Amap facts, public evidence, and vector memory remain bounded tools with
source references.

## Planning Job Lifecycle

### Create

The browser submits a planning request with city, date range, chips, natural
language constraints, imported places, must-visit text, avoid text, budget,
companion, and transport preferences.

The API:

- validates and normalizes the request,
- creates `planning_jobs`,
- creates an initial `trip` if needed,
- writes queued trace events,
- publishes a RocketMQ message,
- returns `jobId` immediately.

### Execute

The worker consumes the job and runs LangGraph.

Graph stages:

1. Intent Agent: normalize desire and constraints.
2. Memory Agent: retrieve user memory and similar itinerary summaries from
   Milvus.
3. Research Planner: create search strategy.
4. POI Search Agent: query Amap and cache results in Redis.
5. Evidence Agent: search Exa/web sources and retrieve related evidence from
   Milvus.
6. Route Architect Agent: assemble candidate daily itinerary.
7. Critic Agent: verify truthfulness, travel feasibility, duplicate stops,
   day balance, and missing evidence.
8. Repair Agent: fix weak plans or downgrade with explicit warnings.
9. Composer Agent: persist final itinerary version and route card.
10. Memory Writer Agent: summarize accepted preferences and store embeddings
    in Milvus.

### Observe

The client should not wait for one blocking response.

Progress can be exposed by:

- polling `GET /api/planning-jobs/:id`,
- later upgrading to Server-Sent Events or WebSocket,
- reading Redis progress snapshots for low-latency updates,
- using PostgreSQL trace events as durable history.

### Recover

If a worker crashes:

- the job stays in PostgreSQL as `queued`, `running`, `failed`, or `retrying`,
- RocketMQ redelivery or retry logic can re-run the job,
- idempotency keys prevent duplicate final route cards,
- trace events show the last successful agent node.

## Data Model Direction

Use Prisma or Drizzle for migrations. The recommended default is Prisma because
the current team velocity benefits from strong schema ergonomics and generated
TypeScript types.

Core tables:

- `users`
- `device_sessions`
- `trips`
- `itinerary_versions`
- `route_cards`
- `route_stops`
- `route_legs`
- `poi_snapshots`
- `evidence_sources`
- `planning_jobs`
- `planning_trace_events`
- `agent_runs`
- `provider_requests`
- `user_memories`
- `vector_references`

Important rules:

- `route_cards.payload` may keep a denormalized JSON copy for rendering
  compatibility, but searchable fields must be normalized.
- `poi_snapshots` must preserve Amap provider IDs, coordinates, address, type,
  and provider raw payload.
- `evidence_sources` must preserve URL, title, snippet, provider, fetched time,
  and confidence metadata.
- `vector_references` connects PostgreSQL records to Milvus collection names
  and vector primary keys.

## Environment And Local Runtime

The project should use root `.env` as the single source of local configuration.

Required target env keys:

```env
DATABASE_URL=postgresql://ai_trip:ai_trip@localhost:5432/ai_trip
REDIS_URL=redis://localhost:6379
ROCKETMQ_ENDPOINT=localhost:8081
ROCKETMQ_ACCESS_KEY=
ROCKETMQ_SECRET_KEY=
ROCKETMQ_TOPIC_PLANNING=ai-trip-planning
MILVUS_ADDRESS=localhost:19530
MILVUS_USERNAME=
MILVUS_PASSWORD=
MILVUS_DATABASE=ai_trip
EMBEDDING_PROVIDER=bailian
EMBEDDING_MODEL=text-embedding-v4
```

Local development should provide Docker Compose services for PostgreSQL, Redis,
RocketMQ, and Milvus. Provider keys remain in root `.env`, not under
`apps/web/.env.local`.

## Migration Strategy

This migration should be implemented in product-safe increments:

1. Add infrastructure config and typed environment loader.
2. Add PostgreSQL schema and replace SQLite route-card store behind the
   existing store interface.
3. Add planning job tables and async job API while keeping current synchronous
   generator as a fallback.
4. Add RocketMQ producer and worker process.
5. Move LangGraph execution into the worker.
6. Add Redis caches and progress snapshots.
7. Add Milvus collections and vector repository interfaces.
8. Add Memory Agent and Evidence Retrieval Agent into the graph.
9. Remove SQLite code and docs after PostgreSQL tests and migration path are green.

The app can keep rendering the same route card UI during the migration.
The change is mostly backend durability and intelligence, not a forced UI
rewrite.

## Explicit Non-Goals

This design does not:

- use SQLite as production persistence,
- use local JSON files for app data,
- use BullMQ as the primary planning queue,
- use pgvector as the target vector database,
- let LLMs invent POI facts without provider-backed candidates,
- require Kafka for the first production planning workflow,
- treat Milvus as the business database,
- split into many services before the data and queue boundaries are stable.

## Testing And Verification

The production platform should add verification at each boundary:

- repository tests against PostgreSQL test database,
- Redis cache tests with deterministic TTL behavior,
- RocketMQ message serialization and idempotency tests,
- Milvus vector repository tests with insert/search/delete fixtures,
- LangGraph worker tests with fake provider tools,
- API tests for job creation, polling, retry, and degraded states,
- migration tests from existing route-card payload shape into PostgreSQL
  records.

Build verification remains:

```bash
cd apps/web
npm run typecheck
npm test
npm run build
```

Infrastructure verification should add:

```bash
docker compose up -d postgres redis rocketmq milvus
cd apps/web
npm run db:migrate
npm run verify:infra
```

## Open Decisions

These are implementation decisions, not product direction blockers:

- Prisma vs Drizzle. Recommendation: Prisma.
- RocketMQ deployment mode for local development. Recommendation: official
  containerized local broker/proxy when feasible.
- Embedding provider. Recommendation: Bailian first because the project already
  supports Bailian and the product is China travel oriented.
- Progress delivery. Recommendation: polling first with durable job state,
  then SSE once async worker is stable.
