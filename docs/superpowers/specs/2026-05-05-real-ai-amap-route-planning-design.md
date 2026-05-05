# Real AI + Amap Route Planning Design

## Status

Approved direction from product discussion on 2026-05-05.

## Goal

Upgrade route generation from a deterministic local-demo planner into a real travel-planning pipeline that combines AI route intent, Amap real-world POI data, Amap routing time, and strict hallucination controls.

## Product Principle

The AI should have an idea before planning, but it must not invent real places.

The planner should therefore use a three-stage pipeline:

1. AI creates an abstract route blueprint without concrete POI names.
2. Amap resolves that blueprint into real candidate POIs.
3. AI arranges only those candidate POIs into a route card, then the system validates and enriches the result.

This keeps the experience creative and personal while keeping places grounded in real map data.

## User-Facing Behavior

When both Amap and OpenAI credentials are configured, route cards should show:

- Real POI names, addresses, coordinates, and map links from Amap.
- AI-generated route concept, day-by-day intent, stop reasons, fit-for copy, highlights, and risk tips.
- Transit or walking time estimates from Amap route planning when available.
- A clear source label such as `Amap real map data + AI planning`.

When only Amap is configured:

- The app should still use real Amap POIs.
- The route order can fall back to deterministic tag/rule scoring.
- The source label should make the fallback clear, such as `Amap real map data + rule planning`.

When Amap is not configured or Amap fails:

- The app should fall back to the current local seed planner.
- The route card must not crash.
- The source label and degraded reason should disclose that local example data was used.

## Planning Pipeline

### Stage 1: AI Route Blueprint

Input:

- City
- Theme
- Start date
- Duration days
- User note
- Product constraints

Output:

- Overall trip rhythm, such as relaxed, photo-heavy, food-led, rainy-day-safe, or budget-aware.
- Day-level intent for one-day or two-day trips.
- Search slots that describe what kinds of POIs are needed.
- Constraints, such as max stops per day, avoid long transfers, prefer indoor stops, or include a night ending.

The blueprint must be abstract. It may say `classic lakeside landmark`, `photo-friendly old street`, or `local snack stop`, but it must not name a specific POI unless that POI came from the user's input.

### Stage 2: Amap Candidate Retrieval

The system converts blueprint search slots into Amap POI search requests.

Each search slot should produce multiple candidates. Candidate POIs should include:

- Stable provider ID
- Name
- Address
- City
- Type or category
- Location coordinates
- Distance if available
- Provider source metadata

The candidate pool should be deduplicated by provider ID first, then by normalized name and coordinate fallback.

The first implementation should use Amap keyword text search. Nearby search can be added after the system has a reliable center point for each day or route cluster.

### Stage 3: AI Candidate Arrangement

Input:

- Original user request
- AI blueprint
- Candidate POI pool
- Hard constraints

Output:

- Selected candidate IDs only, never free-form POI names.
- Stop order.
- Day assignment.
- Stop-level reason.
- Route-level highlights, fit-for copy, risk tips, and optional alternative candidates.

The AI response must be structured and schema-validated. The schema must only allow candidate IDs as selected stops. If the AI selects an unknown ID, duplicates too many stops, violates duration constraints, or returns malformed output, the app must discard the AI arrangement and use a deterministic rule fallback.

### Stage 4: Amap Route-Time Enrichment

For each adjacent stop pair, the system calls Amap route planning.

Default route mode:

- Walking for short citywalk legs.
- Transit is out of scope for the first implementation and can be added in a follow-up iteration when a leg exceeds a distance or time threshold.

If Amap route planning fails for a leg, the app may use the existing coordinate-based estimate for that leg and mark the leg as degraded.

### Stage 5: Route Card Assembly

The final route card combines:

- Real POI data from Amap.
- AI or rule reasons and route copy.
- Amap route-time estimates when available.
- Existing share-card fields.
- Source and confidence metadata.

## Environment Configuration

Add server-only environment variables:

- `AMAP_WEB_SERVICE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Default `OPENAI_MODEL` should be configurable. Use a current Responses API model that supports structured outputs. The implementation must not expose API keys to client components.

## Data Model Additions

Extend route data without breaking existing saved local cards:

- `providerPoiId?: string`
- `address?: string`
- `providerType?: string`
- `day?: 1 | 2`
- `sourceMode` should support real provider and mixed states already represented by the current type.

Add route-card metadata:

- `planningMode`: `ai_amap` | `rule_amap` | `fallback_seed`
- `blueprintSummary?: string`
- `providerWarnings?: string[]`

Existing saved cards that lack these optional fields must continue rendering.

## Hallucination And Safety Controls

AI may:

- Create abstract route intent.
- Choose among provided candidate IDs.
- Explain why selected candidates fit the route.
- Suggest risks and tradeoffs.

AI must not:

- Invent POIs.
- Invent addresses, coordinates, opening hours, prices, or transit times.
- Override provider data.
- Ignore schema constraints.

System validation must:

- Reject selected candidate IDs outside the candidate pool.
- Reject duplicate selected IDs.
- Enforce stop-count limits.
- Enforce day assignment for two-day routes.
- Keep map coordinates and addresses from Amap, not from AI text.

## Error Handling

Error handling should be layered:

1. OpenAI blueprint failure -> generate rule-based search slots from the theme catalog.
2. Amap POI failure or missing key -> local seed fallback.
3. OpenAI arrangement failure -> deterministic arrangement using scored Amap candidates.
4. Amap route-time failure -> coordinate-based leg estimate for that leg.

The UI should surface source and degraded warnings, but not expose raw provider errors.

## Testing

Automated tests should cover:

- AI blueprint schema parsing.
- Search-slot to Amap query mapping.
- Amap POI response normalization.
- AI arrangement whitelist validation.
- Unknown AI-selected candidate IDs are rejected.
- Duplicate AI-selected candidate IDs are rejected.
- Amap route-time response normalization.
- Missing keys fall back without crashing.
- Generate API returns a route card in all fallback modes.

Provider calls should be tested through injectable clients and fixtures. Unit tests must not require real Amap or OpenAI credentials.

Manual verification should cover:

- With no keys: current local generation still works.
- With only Amap key: real POIs appear and the source label says rule planning.
- With Amap and OpenAI keys: real POIs appear, AI route copy appears, and selected POIs are all from the provider candidate pool.
- Two-day route shows day-level planning intent.

## Implementation Notes

Introduce focused modules instead of expanding `planner.ts` into a provider-heavy file:

- `src/server/amap-client.ts`: low-level Amap HTTP calls.
- `src/server/openai-route-client.ts`: low-level OpenAI structured-output calls.
- `src/domain/route-blueprint.ts`: blueprint types, schemas, and fallback slot generation.
- `src/domain/route-arrangement.ts`: AI arrangement types, validation, and rule fallback arrangement.
- `src/domain/real-route-planner.ts`: orchestration from user request to final route card.
- Keep `src/domain/planner.ts` as the local seed fallback planner.

## References

- Amap POI Search 2.0 supports keyword, nearby, polygon, and ID search through Web API.
- Amap Route Planning 2.0 supports walking, transit, driving, bicycling, and electric-bike route planning through Web API.
- OpenAI Structured Outputs can constrain model responses to a supplied JSON Schema.

## Success Criteria

- `bash scripts/dev.sh verify` passes.
- Existing route generation continues working without any keys.
- Real Amap POIs are used when `AMAP_WEB_SERVICE_KEY` is configured.
- AI planning is used when both `AMAP_WEB_SERVICE_KEY` and `OPENAI_API_KEY` are configured.
- AI-selected stops are always validated against the Amap candidate pool.
- The UI clearly distinguishes `ai_amap`, `rule_amap`, and `fallback_seed` planning modes.
