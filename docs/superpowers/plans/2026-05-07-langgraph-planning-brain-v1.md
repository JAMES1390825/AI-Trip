# LangGraph Planning Brain V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a controllable LangGraph.js multi-agent planning brain behind the existing route generation API and expose real graph trace events to the Web planner UI.

**Architecture:** Add `@langchain/langgraph` as the server-side graph runtime. Keep existing Amap, Exa, AI-provider, route-quality, and route-card modules as trusted tools. Introduce a new graph module that composes named nodes for intent, research, POI search, evidence, route architecture, critique, repair, pretrip, and composition, while preserving the existing `RouteCard` output contract.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner, `@langchain/langgraph`, existing provider clients.

---

## File Structure

- Modify `apps/web/package.json` and `apps/web/package-lock.json`: add `@langchain/langgraph`.
- Modify `apps/web/src/domain/types.ts`: add `PlanningTraceEvent` and optional `planningTrace` on `RouteCard`.
- Create `apps/web/src/domain/planning-trace.ts`: trace node/status constants and helper functions.
- Create `apps/web/src/domain/planning-trace.test.ts`: trace helper tests.
- Modify `apps/web/src/domain/real-route-planner.ts`: export reusable helper functions and planner dependency types.
- Create `apps/web/src/domain/trip-planning-graph.ts`: LangGraph state, graph nodes, routing, and `generateGraphRouteCard`.
- Create `apps/web/src/domain/trip-planning-graph.test.ts`: graph success, fallback, evidence failure, invalid AI arrangement, and trace tests.
- Modify `apps/web/app/api/route-cards/generate/route.ts`: call graph generator and return `planningTrace`.
- Modify `apps/web/app/api/route-cards/generate/route.test.ts`: assert graph trace in API response.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: read `planningTrace` from generate response and render real trace after generation.
- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: assert graph trace labels are supported.
- Modify `apps/web/app/globals.css`: add graph trace warning/error visual states if needed.

## Tasks

### Task 1: Dependencies And Trace Types

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/src/domain/types.ts`
- Create: `apps/web/src/domain/planning-trace.ts`
- Create: `apps/web/src/domain/planning-trace.test.ts`

- [ ] **Step 1: Install LangGraph**

Run:

```bash
npm install @langchain/langgraph
```

Expected: `apps/web/package.json` and `apps/web/package-lock.json` include the new dependency.

- [ ] **Step 2: Write failing trace helper tests**

Create `apps/web/src/domain/planning-trace.test.ts` with tests asserting:

- `createQueuedPlanningTrace()` returns all graph nodes in queued status.
- `markTraceNode()` can mark a node as active/done/warning/error.
- `mergeCompletedPlanningTrace()` preserves completed graph labels and queued missing nodes.

Run:

```bash
npm test -- src/domain/planning-trace.test.ts
```

Expected: FAIL because `planning-trace.ts` does not exist yet.

- [ ] **Step 3: Implement trace types and helpers**

Add `PlanningTraceNodeId`, `PlanningTraceStatus`, and `PlanningTraceEvent` to `types.ts`.

Create `planning-trace.ts` with:

- `planningTraceNodes`,
- `createQueuedPlanningTrace()`,
- `markTraceNode(trace, nodeId, status, detail?)`,
- `mergeCompletedPlanningTrace(trace)`.

- [ ] **Step 4: Verify trace tests**

Run:

```bash
npm test -- src/domain/planning-trace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/domain/types.ts apps/web/src/domain/planning-trace.ts apps/web/src/domain/planning-trace.test.ts
git commit -m "feat: add planning graph trace primitives"
```

### Task 2: LangGraph Core

**Files:**
- Modify: `apps/web/src/domain/real-route-planner.ts`
- Create: `apps/web/src/domain/trip-planning-graph.ts`
- Create: `apps/web/src/domain/trip-planning-graph.test.ts`

- [ ] **Step 1: Write failing graph tests**

Create graph tests with mocked dependencies:

- happy path returns a `RouteCard` and trace includes `intent_agent`, `poi_search_agent`, `route_architect_agent`, `critic_agent`, and `composer`.
- no Amap candidates returns degraded fallback and marks fallback trace.
- evidence provider failure still returns a route card with evidence warning.
- invalid AI arrangement falls back to rule arrangement after a critique/repair path.

Run:

```bash
npm test -- src/domain/trip-planning-graph.test.ts
```

Expected: FAIL because `trip-planning-graph.ts` does not exist.

- [ ] **Step 2: Export reusable planner helpers**

In `real-route-planner.ts`, export dependency types and helper functions needed by the graph:

- `PlannerAmapClient`,
- `PlannerAiClient`,
- `EvidenceSources`,
- `dedupeCandidates`,
- `buildLegs`,
- `buildStopsFromArrangement`,
- `assembleCard`,
- `maybeAiArrangement`,
- `searchEvidenceSafely`.

Run existing planner tests:

```bash
npm test -- src/domain/real-route-planner.test.ts
```

Expected: PASS.

- [ ] **Step 3: Implement graph state and nodes**

Create `trip-planning-graph.ts` using `StateGraph`, `Annotation`, `START`, and `END` from `@langchain/langgraph`.

Implement:

- `TripPlanningGraphState`,
- `RouteCritique`,
- `generateGraphRouteCard(request, deps)`,
- nodes for intent, research, POI search, evidence, route architecture, critic, repair, pretrip, composer, and fallback composer,
- conditional routing after POI search and critic.

- [ ] **Step 4: Verify graph tests**

Run:

```bash
npm test -- src/domain/trip-planning-graph.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/domain/real-route-planner.ts apps/web/src/domain/trip-planning-graph.ts apps/web/src/domain/trip-planning-graph.test.ts
git commit -m "feat: add langgraph trip planning brain"
```

### Task 3: API Integration

**Files:**
- Modify: `apps/web/app/api/route-cards/generate/route.ts`
- Modify: `apps/web/app/api/route-cards/generate/route.test.ts`

- [ ] **Step 1: Write failing API trace tests**

Update generate route tests to assert the response includes:

- `routeCard`,
- `planningTrace`,
- at least one trace event with `nodeId: "composer"` and `status: "done"`.

Run:

```bash
npm test -- app/api/route-cards/generate/route.test.ts
```

Expected: FAIL because the API still returns only `routeCard`.

- [ ] **Step 2: Switch API to graph generator**

Modify `route.ts` to call `generateGraphRouteCard(body)` and return:

```ts
jsonOk({ routeCard: result.routeCard, planningTrace: result.planningTrace })
```

If graph throws unexpectedly, catch it and fall back to `generateRealRouteCard(body)` with a minimal error trace.

- [ ] **Step 3: Verify API tests**

Run:

```bash
npm test -- app/api/route-cards/generate/route.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/route-cards/generate/route.ts apps/web/app/api/route-cards/generate/route.test.ts
git commit -m "feat: return planning graph trace from generate api"
```

### Task 4: Frontend Trace Rendering And Verification

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing UI trace tests**

Update `RoutePlannerApp.test.ts` to assert:

- static render still shows graph node labels,
- progress stream can render API trace statuses,
- existing local progress labels remain available before generation.

Run:

```bash
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: FAIL until `RoutePlannerApp` uses API trace.

- [ ] **Step 2: Store and render API trace**

Modify `RoutePlannerApp.tsx`:

- read generate response as `{ routeCard, planningTrace?: PlanningTraceEvent[] }`,
- store `planningTrace` in state,
- render API trace when present,
- reset trace when starting a new generation,
- keep local active timer while request is pending.

- [ ] **Step 3: Add trace CSS**

Add styles for warning/error trace states if not already covered.

- [ ] **Step 4: Verify UI tests**

Run:

```bash
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: PASS.

- [ ] **Step 5: Full verification**

Run:

```bash
npm run verify
```

Expected: PASS for typecheck, tests, and build.

- [ ] **Step 6: Browser smoke**

Open `http://localhost:3000` and verify:

- page loads,
- generating a route still works,
- result shows graph-backed completed trace.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: show graph planning trace in planner"
```

## Self-Review

- Spec coverage: tasks cover LangGraph dependency, graph state, nodes, fallbacks, API trace output, frontend trace rendering, tests, and full verification.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain.
- Type consistency: `PlanningTraceEvent`, `generateGraphRouteCard`, and `planningTrace` names are consistent across tasks.
