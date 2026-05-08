# Production Agent Platform V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production backend platform slice for AI Trip:
PostgreSQL, Redis, Milvus, RocketMQ, Prisma schema, and typed Node adapters.

**Architecture:** Keep the current Next.js app working while introducing
production infrastructure behind focused server-side boundaries. The first
slice does not move all planning execution into RocketMQ yet; it creates the
schema, local services, clients, and a PostgreSQL route-card store that later
planning workers can reuse.

**Tech Stack:** Next.js, TypeScript, Prisma, PostgreSQL, Redis, Milvus,
RocketMQ, Node test runner, Docker Compose.

---

## File Structure

- Create `docker-compose.yml`: local PostgreSQL, Redis, Milvus standalone, and
  RocketMQ services.
- Modify `.env.example`: replace SQLite-first storage with production backend
  env keys while keeping legacy route-card env as migration-only.
- Modify `apps/web/package.json`: add Prisma, Redis, Milvus, RocketMQ, and
  production verification scripts.
- Create `apps/web/prisma/schema.prisma`: normalized production data model.
- Create `apps/web/src/server/production-env.ts`: typed production env loader.
- Create `apps/web/src/server/production-env.test.ts`: env parsing tests.
- Create `apps/web/src/server/redis-cache.ts`: Redis cache interface and
  implementation.
- Create `apps/web/src/server/redis-cache.test.ts`: fake client behavior tests.
- Create `apps/web/src/server/vector-store.ts`: Milvus vector store interface
  and implementation.
- Create `apps/web/src/server/vector-store.test.ts`: fake Milvus tests.
- Create `apps/web/src/server/planning-queue.ts`: RocketMQ planning queue
  interface and implementation.
- Create `apps/web/src/server/planning-queue.test.ts`: fake RocketMQ tests.
- Create `apps/web/src/server/postgres-route-card-store.ts`: Prisma-backed
  route-card store implementation.
- Create `apps/web/src/server/postgres-route-card-store.test.ts`: repository
  mapping tests using a fake Prisma delegate.
- Modify `README.md` and
  `docs/product/citywalk-route-cards-architecture.md`: document the V1 platform
  slice and local startup.

## Task 1: Production Environment Contract

**Files:**

- Modify: `.env.example`
- Create: `apps/web/src/server/production-env.test.ts`
- Create: `apps/web/src/server/production-env.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/server/production-env.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readProductionEnv } from "./production-env";

test("readProductionEnv returns typed defaults for local platform services", () => {
  const env = readProductionEnv({});

  assert.equal(env.databaseUrl, "postgresql://ai_trip:ai_trip@localhost:5432/ai_trip");
  assert.equal(env.redisUrl, "redis://localhost:6379");
  assert.equal(env.rocketmq.endpoints, "localhost:8081");
  assert.equal(env.rocketmq.topicPlanning, "ai-trip-planning");
  assert.equal(env.milvus.address, "localhost:19530");
  assert.equal(env.milvus.database, "ai_trip");
  assert.equal(env.embedding.provider, "bailian");
  assert.equal(env.embedding.model, "text-embedding-v4");
});

test("readProductionEnv preserves provided production service values", () => {
  const env = readProductionEnv({
    DATABASE_URL: "postgresql://prod/app",
    REDIS_URL: "redis://redis.internal:6379",
    ROCKETMQ_ENDPOINT: "rmq.internal:8081",
    ROCKETMQ_ACCESS_KEY: "ak",
    ROCKETMQ_SECRET_KEY: "sk",
    ROCKETMQ_TOPIC_PLANNING: "planning-prod",
    MILVUS_ADDRESS: "milvus.internal:19530",
    MILVUS_USERNAME: "root",
    MILVUS_PASSWORD: "secret",
    MILVUS_DATABASE: "prod_ai_trip",
    EMBEDDING_PROVIDER: "openai",
    EMBEDDING_MODEL: "text-embedding-3-large"
  });

  assert.equal(env.databaseUrl, "postgresql://prod/app");
  assert.equal(env.redisUrl, "redis://redis.internal:6379");
  assert.equal(env.rocketmq.endpoints, "rmq.internal:8081");
  assert.equal(env.rocketmq.accessKey, "ak");
  assert.equal(env.rocketmq.secretKey, "sk");
  assert.equal(env.rocketmq.topicPlanning, "planning-prod");
  assert.equal(env.milvus.address, "milvus.internal:19530");
  assert.equal(env.milvus.username, "root");
  assert.equal(env.milvus.password, "secret");
  assert.equal(env.milvus.database, "prod_ai_trip");
  assert.equal(env.embedding.provider, "openai");
  assert.equal(env.embedding.model, "text-embedding-3-large");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/server/production-env.test.ts`

Expected: FAIL with module not found for `./production-env`.

- [ ] **Step 3: Implement production env reader**

Create `apps/web/src/server/production-env.ts`:

```ts
export type ProductionEnv = {
  databaseUrl: string;
  redisUrl: string;
  rocketmq: {
    endpoints: string;
    accessKey?: string;
    secretKey?: string;
    topicPlanning: string;
  };
  milvus: {
    address: string;
    username?: string;
    password?: string;
    database: string;
  };
  embedding: {
    provider: string;
    model: string;
  };
};

type EnvSource = Record<string, string | undefined>;

function value(env: EnvSource, key: string, fallback: string): string {
  const raw = env[key];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function optionalValue(env: EnvSource, key: string): string | undefined {
  const raw = env[key];
  return raw && raw.trim() ? raw.trim() : undefined;
}

export function readProductionEnv(env: EnvSource = process.env): ProductionEnv {
  return {
    databaseUrl: value(env, "DATABASE_URL", "postgresql://ai_trip:ai_trip@localhost:5432/ai_trip"),
    redisUrl: value(env, "REDIS_URL", "redis://localhost:6379"),
    rocketmq: {
      endpoints: value(env, "ROCKETMQ_ENDPOINT", "localhost:8081"),
      accessKey: optionalValue(env, "ROCKETMQ_ACCESS_KEY"),
      secretKey: optionalValue(env, "ROCKETMQ_SECRET_KEY"),
      topicPlanning: value(env, "ROCKETMQ_TOPIC_PLANNING", "ai-trip-planning")
    },
    milvus: {
      address: value(env, "MILVUS_ADDRESS", "localhost:19530"),
      username: optionalValue(env, "MILVUS_USERNAME"),
      password: optionalValue(env, "MILVUS_PASSWORD"),
      database: value(env, "MILVUS_DATABASE", "ai_trip")
    },
    embedding: {
      provider: value(env, "EMBEDDING_PROVIDER", "bailian"),
      model: value(env, "EMBEDDING_MODEL", "text-embedding-v4")
    }
  };
}
```

- [ ] **Step 4: Update `.env.example`**

Replace the SQLite-first header with production platform keys:

```env
# Production data platform. Keep real values only in the root .env.
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

# Legacy migration-only local route-card storage.
ROUTE_CARD_DATABASE_FILE=
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npm test -- src/server/production-env.test.ts`

Expected: PASS.

## Task 2: Local Infrastructure And Prisma Schema

**Files:**

- Create: `docker-compose.yml`
- Modify: `apps/web/package.json`
- Create: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add dependencies and scripts**

Run:

```bash
cd apps/web
npm install @prisma/client redis @zilliz/milvus2-sdk-node rocketmq-client-nodejs
npm install -D prisma
```

Modify `apps/web/package.json` scripts:

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:push": "prisma db push",
"verify:infra": "npm run typecheck && npm test -- src/server/production-env.test.ts src/server/redis-cache.test.ts src/server/vector-store.test.ts src/server/planning-queue.test.ts src/server/postgres-route-card-store.test.ts"
```

- [ ] **Step 2: Create Docker Compose**

Create `docker-compose.yml` at repo root with PostgreSQL, Redis, RocketMQ
namesrv/broker/proxy, and Milvus standalone dependencies.

- [ ] **Step 3: Create Prisma schema**

Create `apps/web/prisma/schema.prisma` with:

- `datasource db` using PostgreSQL and `env("DATABASE_URL")`.
- `generator client` using `prisma-client-js`.
- Models: `User`, `DeviceSession`, `Trip`, `ItineraryVersion`, `RouteCard`,
  `RouteStop`, `RouteLeg`, `PoiSnapshot`, `EvidenceSource`, `PlanningJob`,
  `PlanningTraceEvent`, `AgentRun`, `ProviderRequest`, `UserMemory`,
  `VectorReference`.

- [ ] **Step 4: Generate Prisma client**

Run: `cd apps/web && npm run db:generate`

Expected: Prisma client generated successfully.

## Task 3: Redis Cache Adapter

**Files:**

- Create: `apps/web/src/server/redis-cache.test.ts`
- Create: `apps/web/src/server/redis-cache.ts`

- [ ] **Step 1: Write failing tests**

Test JSON set/get and key prefixing through a fake client.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/server/redis-cache.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement Redis adapter**

Expose `createRedisCache`, `createRedisClientFromEnv`, and `RedisCache`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npm test -- src/server/redis-cache.test.ts`

Expected: PASS.

## Task 4: Milvus Vector Store Adapter

**Files:**

- Create: `apps/web/src/server/vector-store.test.ts`
- Create: `apps/web/src/server/vector-store.ts`

- [ ] **Step 1: Write failing tests**

Test collection names, PostgreSQL reference metadata, and similarity result
normalization through a fake Milvus client.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/server/vector-store.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement vector store adapter**

Expose `createMilvusVectorStore`, `VectorCollectionName`, and typed upsert/search
methods that do not hide PostgreSQL references.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npm test -- src/server/vector-store.test.ts`

Expected: PASS.

## Task 5: RocketMQ Planning Queue Adapter

**Files:**

- Create: `apps/web/src/server/planning-queue.test.ts`
- Create: `apps/web/src/server/planning-queue.ts`

- [ ] **Step 1: Write failing tests**

Test planning job event shape, topic selection, idempotency key propagation, and
JSON serialization through a fake producer.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/server/planning-queue.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement RocketMQ adapter**

Expose `createRocketMqPlanningQueue`, `PlanningQueue`, and event types for
`planning.job.created`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npm test -- src/server/planning-queue.test.ts`

Expected: PASS.

## Task 6: PostgreSQL Route Card Store Boundary

**Files:**

- Create: `apps/web/src/server/postgres-route-card-store.test.ts`
- Create: `apps/web/src/server/postgres-route-card-store.ts`

- [ ] **Step 1: Write failing tests**

Test that saving a route card writes normalized fields plus JSON payload, list
returns summaries, get parses payload, and delete maps count to boolean.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test -- src/server/postgres-route-card-store.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement Prisma-backed route-card store**

Implement `createPostgresRouteCardStore(prismaLike)` using the existing
`RouteCardStore` interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npm test -- src/server/postgres-route-card-store.test.ts`

Expected: PASS.

## Task 7: Documentation And Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`

- [ ] **Step 1: Update docs**

Document:

- production platform V1 components,
- local `docker compose up -d postgres redis rocketmq-namesrv rocketmq-broker rocketmq-proxy milvus-standalone`,
- `cd apps/web && npm run db:generate`,
- SQLite route-card store remains legacy until migration switch.

- [ ] **Step 2: Run full verification**

Run:

```bash
cd apps/web
npm run typecheck
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add .
git commit -m "feat: add production platform infrastructure"
```

