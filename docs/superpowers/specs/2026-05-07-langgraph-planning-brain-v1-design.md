# LangGraph Planning Brain V1 Design

## Goal

Upgrade AI Trip from a linear route generator into a controllable multi-agent travel planning brain, using LangGraph.js as the orchestration layer while keeping the current Node/TypeScript planner modules as trusted tools.

## Product Direction

The product has reached the point where "one API call returns one route" is no longer the right mental model. The next product promise is:

- understand messy user intent,
- research real places and public evidence,
- reason about route tradeoffs,
- critique and repair weak plans,
- expose planning progress honestly,
- keep the final output compatible with the current map plus daily itinerary UI.

This is a good fit for LangGraph because the problem is now stateful, multi-step, and benefits from inspectable node-by-node execution. Official LangGraph documentation describes it as a low-level orchestration framework for long-running, stateful agents, with durable execution, streaming, human-in-the-loop, memory, and debugging support. LangGraph can also be used without adopting the full LangChain stack, which matches our need for controlled planning rather than a fully autonomous black box.

References:

- LangGraph overview: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph StateGraph API: https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateGraph.html
- LangGraph thinking model: https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph
- LangGraph frontend streaming patterns: https://docs.langchain.com/oss/javascript/langgraph/frontend/overview

## Current System

The current route generation chain lives mainly in:

- `apps/web/src/domain/real-route-planner.ts`
- `apps/web/src/domain/user-intent.ts`
- `apps/web/src/domain/route-blueprint.ts`
- `apps/web/src/domain/route-arrangement.ts`
- `apps/web/src/domain/route-quality.ts`
- `apps/web/src/domain/pretrip-checklist.ts`
- `apps/web/src/server/amap-client.ts`
- `apps/web/src/server/web-evidence-provider.ts`
- `apps/web/src/server/route-ai-client.ts`

The existing flow is already modular:

1. infer user intent,
2. build search blueprint,
3. search Amap POIs,
4. search Exa public evidence,
5. ask configured AI provider to arrange route,
6. fall back to rule arrangement when AI is unavailable,
7. validate arrangement,
8. build route stops and walking legs,
9. assemble `RouteCard`,
10. build quality summary and pretrip checklist.

LangGraph V1 should wrap and strengthen this flow, not replace it wholesale.

## Dependency Strategy

Add only the minimum LangGraph/LangChain dependencies needed for V1:

- `@langchain/langgraph` for `StateGraph`, graph nodes, conditional routing, and event streaming.
- `@langchain/core` only if needed for shared message/tool primitives.

Do not add the full `langchain` autonomous agent executor in V1. The graph should be explicit and testable. Each agent is a named graph node with a clear contract, not an open-ended model loop that can call arbitrary tools.

This is still a real multi-agent design: every node owns a distinct planning responsibility, writes its own state slice, emits its own trace events, and can later be upgraded from deterministic logic to LLM/tool reasoning without changing the whole graph.

This keeps three properties:

- **Control:** high-risk facts still come from Amap and approved evidence providers.
- **Debuggability:** every node writes structured state and trace events.
- **Incremental migration:** existing tests and fallback planner remain useful.

## Graph State

Create a focused server-side graph state type, for example `TripPlanningGraphState`.

State fields:

- `request`: sanitized `RouteCardRequest`.
- `intent`: result from `inferUserIntent`.
- `blueprint`: route search blueprint from `buildFallbackBlueprint`.
- `queries`: city-scoped Amap query list.
- `candidates`: deduped `RealPoiCandidate[]`.
- `evidenceSources`: public evidence attached to the plan.
- `evidenceWarning`: optional warning when evidence search fails.
- `arrangement`: selected route arrangement.
- `critique`: structured route quality critique before composing the final card.
- `repairAttempts`: number of repair loops already attempted.
- `stops`: generated `RouteStop[]`.
- `legs`: generated `RouteLeg[]`.
- `routeCard`: final `RouteCard`.
- `trace`: ordered graph events for frontend progress and debugging.
- `warnings`: user-facing provider and planning warnings.
- `error`: recoverable graph error code when fallback is needed.

Trace event shape:

```ts
type PlanningTraceEvent = {
  nodeId:
    | "intent_agent"
    | "research_planner"
    | "poi_search_agent"
    | "evidence_agent"
    | "route_architect_agent"
    | "critic_agent"
    | "repair_agent"
    | "pretrip_agent"
    | "composer";
  label: string;
  status: "queued" | "active" | "done" | "warning" | "error";
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
};
```

## Agent Nodes

### 1. Intent Agent

Purpose: turn raw request fields into a travel intent object.

Implementation:

- Reuse `inferUserIntent`.
- No external LLM required in V1.
- Output intent summary, constraints, preferred travel style, and risk-relevant notes.

Why deterministic: intent is foundational, and the current deterministic inference is already reliable enough for V1.

### 2. Research Planner

Purpose: decide what to search before touching providers.

Implementation:

- Reuse `buildFallbackBlueprint`.
- Reuse `searchSlotsToAmapQueries`.
- Include must-visit text, avoid constraints, imported text, companion type, transport preference, and budget hints.

Output:

- structured search slots,
- Amap query list,
- blueprint summary for later AI arrangement.

### 3. POI Search Agent

Purpose: fetch real candidate places from Amap.

Implementation:

- Reuse `AmapClient.searchPois`.
- Deduplicate candidates.
- Record provider health in graph state.
- If candidates are fewer than three, route to fallback composer.

Output:

- `RealPoiCandidate[]`,
- provider warning when supply is weak.

### 4. Evidence Agent

Purpose: attach public travel evidence without pretending to have unsupported sources.

Implementation:

- Reuse `createWebEvidenceProvider` and `WebEvidenceProvider.searchEvidence`.
- V1 supports Exa when configured and returns no evidence when unavailable.
- Do not mention Xiaohongshu official search unless a legitimate source integration exists.

Output:

- `StopEvidence[]`,
- warning when evidence search fails.

### 5. Route Architect Agent

Purpose: create the route arrangement from candidates.

Implementation:

- Reuse the configured `RouteAiJsonClient` from OpenAI, DeepSeek, or Bailian.
- Prompt the model to choose only existing candidate IDs.
- Validate with `validateAiArrangement`.
- Fall back to `arrangeCandidatesByRule` when AI is missing or invalid.

Output:

- `AiRouteArrangement`,
- planning mode candidate: `ai_amap` or `rule_amap`.

### 6. Critic Agent

Purpose: inspect the draft before composing the final card.

Implementation:

- Validate stop count, duplicate candidates, invalid days, missing day two, excessive degradation, and evidence/provider warning severity.
- Build a structured critique:

```ts
type RouteCritique = {
  accepted: boolean;
  reasons: string[];
  repairHints: string[];
  confidencePenalty: number;
};
```

Routing:

- If accepted, continue to `pretrip_agent`.
- If rejected and `repairAttempts < 1`, route to `repair_agent`.
- If rejected after repair, continue with degraded warnings rather than blocking the user.

### 7. Repair Agent

Purpose: fix weak drafts without restarting the whole request.

Implementation:

- V1 repair is bounded to one attempt.
- Use critique hints to rerun arrangement with a more explicit planning context.
- Do not repeat Amap calls unless candidate supply itself is the critique reason.

Output:

- updated arrangement,
- incremented `repairAttempts`,
- trace event explaining what was repaired.

### 8. Pretrip Agent

Purpose: turn final draft facts into practical user preparation.

Implementation:

- Reuse `buildPretripChecklist`.
- Add provider warnings and evidence warnings before final composition.

Output:

- checklist-ready route facts.

### 9. Composer

Purpose: convert graph state into the existing `RouteCard` contract.

Implementation:

- Preserve current `RouteCard` shape so the frontend does not need a rewrite.
- Add `planningTrace?: PlanningTraceEvent[]` to `RouteCard` or return trace alongside `routeCard` from the API.
- Preserve current share card, map, day itinerary, quality summary, and saved-trip behavior.

## Graph Routing

Target V1 graph:

```text
START
  -> intent_agent
  -> research_planner
  -> poi_search_agent
  -> evidence_agent
  -> route_architect_agent
  -> critic_agent
      -> repair_agent -> route_architect_agent
      -> pretrip_agent
  -> composer
  -> END
```

Fallback routing:

```text
poi_search_agent
  -> fallback_composer when Amap candidates < 3
  -> evidence_agent otherwise
```

Repair routing:

```text
critic_agent
  -> repair_agent when accepted=false and repairAttempts < 1
  -> pretrip_agent otherwise
```

## API Contract

Keep the existing endpoint:

- `POST /api/route-cards/generate`

V1 response shape:

```ts
{
  routeCard: RouteCard;
  planningTrace: PlanningTraceEvent[];
}
```

The frontend can continue to read `routeCard`. New UI can read `planningTrace` when present. This is backward-compatible for existing tests and saved route behavior.

Streaming is not required for the first graph implementation. The graph should still collect real node trace events. A later V1.1 can add an event stream endpoint or server-sent events:

- `POST /api/route-cards/generate/stream`

## Frontend Integration

The current planning progress UI should stop being a purely local timer once graph trace exists.

V1 frontend behavior:

- Before generation: show graph nodes as `queued`.
- During generation: continue showing local active progress if the endpoint is synchronous.
- After generation: replace the local progress ledger with real `planningTrace` from the graph response.
- If graph fallback occurs, show the warning in the progress ledger and route quality panel.

This avoids introducing streaming before the graph core is stable.

## Persistence And Memory

V1 should not add account-level long-term memory yet.

Allowed:

- in-memory graph execution per request,
- optional `MemorySaver` only in tests or local experiments,
- trace persisted indirectly when a route card is saved if `RouteCard` stores trace.

Deferred:

- user profile memory,
- cross-session preference learning,
- background jobs,
- resumable week-long planning threads,
- human approval interrupts.

Reason: durable execution and human-in-the-loop are valuable later, but V1's main goal is to establish a reliable graph brain behind the existing product.

## Error Handling

Graph errors should be part of the flow:

- Missing AI provider: continue with rule arrangement.
- Amap unavailable or too few candidates: use existing seed fallback and mark degraded.
- Evidence provider unavailable: continue with Amap candidates and evidence warning.
- AI arrangement invalid: retry through repair once, then use rule arrangement.
- Unexpected graph error: return existing fallback `generateRouteCard` result with a clear degraded reason.

The user should never see raw provider errors or internal stack traces.

## Testing Strategy

Add tests at three levels:

### Unit Tests

- graph state helpers append trace events correctly,
- critic accepts valid plans,
- critic rejects duplicate, missing, or invalid arrangements,
- repair route is chosen only once.

### Graph Tests

- happy path runs all nodes and returns `ai_amap` or `rule_amap`,
- no Amap candidates routes to fallback composer,
- evidence failure does not fail generation,
- invalid AI arrangement triggers repair or rule fallback,
- output preserves the existing `RouteCard` contract.

### API/UI Tests

- generate API returns `planningTrace`,
- frontend renders graph trace labels when response includes them,
- existing route card generation tests continue passing.

## Non-Goals

- Full LangChain autonomous agent executor.
- Unbounded tool-calling loops.
- Xiaohongshu scraping or unsupported private data sources.
- User account memory.
- Streaming endpoint in the first graph commit.
- Replacing the current `RouteCard` UI.
- Rewriting all existing planner modules.

## Acceptance Criteria

1. `@langchain/langgraph` is installed and used server-side.
2. A `TripPlanningGraphState` type defines the shared state.
3. The graph has named nodes for intent, research, POI search, evidence, route architecture, critique, repair, pretrip, and composition.
4. `/api/route-cards/generate` can generate a route through the graph.
5. Existing planner fallbacks remain functional.
6. API response includes a real graph planning trace.
7. Frontend can render completed graph trace after generation.
8. Existing route card UI and saved route behavior remain compatible.
9. Tests cover graph success, fallback, evidence failure, invalid AI arrangement, and trace output.
10. `npm run verify` passes before merge.

## Rollout Plan

Phase 1: build graph core behind a new `generateGraphRouteCard` function and test it with mocked dependencies.

Phase 2: switch `/api/route-cards/generate` to the graph function while keeping old `generateRealRouteCard` as emergency fallback.

Phase 3: expose `planningTrace` to `RoutePlannerApp`.

Phase 4: after graph V1 is stable, consider a streaming endpoint and durable persistence.

## Self-Review

- Placeholder scan: no TBD, TODO, or open-ended implementation gaps remain.
- Internal consistency: V1 uses LangGraph for explicit orchestration and keeps existing provider/tool modules.
- Scope check: focused on graph brain, trace output, and compatibility; memory, streaming, and full LangChain agents are deferred.
- Ambiguity check: "multi-agent" means named graph nodes with clear contracts, not autonomous unbounded agents.
