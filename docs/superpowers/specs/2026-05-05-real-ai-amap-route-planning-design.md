# Real AI + Amap Route Planning Design

## Status

Approved direction from product discussion on 2026-05-05.

## Goal

Upgrade route generation from a deterministic local-demo planner into a real travel-planning pipeline that combines AI route intent, Amap real-world POI data, Amap routing time, and strict hallucination controls.

## Product Principle

The AI should have an idea before planning, but it must not invent real places.

The planner should therefore use a four-stage planning pipeline:

1. AI structures user intent from the request.
2. AI creates an abstract route blueprint without concrete POI names.
3. Amap resolves that blueprint into real candidate POIs.
4. AI arranges only those candidate POIs into a route card, then the system validates and enriches the result.

This keeps the experience creative and personal while keeping places grounded in real map data. The product should feel like a thoughtful travel planner, not a database query.

## User-Facing Behavior

When both Amap and OpenAI credentials are configured, route cards should show:

- Real POI names, addresses, coordinates, and map links from Amap.
- AI-generated route concept, day-by-day intent, stop reasons, fit-for copy, highlights, and risk tips.
- Walking time estimates from Amap route planning when available.
- A clear source label such as `Amap real map data + AI planning`.
- Clear trip tradeoffs, such as why this route is relaxed, photo-friendly, rainy-day-safe, or food-led.
- Practical adjustment hints, such as which stop to skip if tired and which stop can be replaced on rainy days.

When only Amap is configured:

- The app should still use real Amap POIs.
- The route order can fall back to deterministic tag/rule scoring.
- The source label should make the fallback clear, such as `Amap real map data + rule planning`.

When Amap is not configured or Amap fails:

- The app should fall back to the current local seed planner.
- The route card must not crash.
- The source label and degraded reason should disclose that local example data was used.

## User Intent Model

Before creating a route blueprint, AI should structure the user's request into travel intent.

Intent fields should include:

- Traveler profile: solo, couple, friends, family, parents, kids, or unknown.
- Physical pace: relaxed, normal, packed, low-walking, or unknown.
- Budget posture: low, normal, flexible, or unknown.
- Start rhythm: early start, late start, afternoon start, night-first, or unknown.
- Interest weights: classic landmarks, photos, food, coffee, shopping, culture, nature, nightlife, rainy-day safety.
- Must-have constraints from the user note.
- Avoid constraints from the user note.
- Confidence of interpretation.

The app should not ask the user to fill a long form in the first implementation. It should infer these fields from `themeId` and `note`, then keep the form simple.

## Route Experience Quality Rules

The route should optimize for an executable day, not just true POIs.

Quality rules:

- One-day routes should usually include 3-4 main stops.
- Two-day routes should usually include 3-4 stops per day when candidate supply allows.
- Each day should have a clear rhythm: opening anchor, middle exploration or meal, and ending anchor.
- Food or coffee stops should be near the main route instead of forcing large detours.
- Avoid more than one long transfer per day.
- Avoid repeating the same kind of experience across both days unless the user explicitly asks for it.
- Rain-friendly routes should include enough indoor or quick-switch options.
- Low-budget routes should prefer free or low-cost POIs and make paid assumptions visible.
- Night routes should avoid early-closing POIs as ending anchors.

If the system cannot satisfy a rule, the route card should explain the tradeoff in user language.

## Planning Pipeline

### Stage 1: AI Intent Structuring

Input:

- City
- Theme
- Start date
- Duration days
- User note

Output:

- Structured intent fields from the User Intent Model.
- A short `intentSummary` for display, such as `轻松拍照，不赶路，优先水岸和街区`.
- Ambiguity notes for internal use when the note is too short.

If AI intent structuring fails, the app should derive intent from the theme catalog and simple note keyword rules.

### Stage 2: AI Route Blueprint

Input:

- City
- Theme
- Start date
- Duration days
- User note
- Structured user intent
- Product constraints

Output:

- Overall trip rhythm, such as relaxed, photo-heavy, food-led, rainy-day-safe, or budget-aware.
- Day-level intent for one-day or two-day trips.
- Search slots that describe what kinds of POIs are needed.
- Constraints, such as max stops per day, avoid long transfers, prefer indoor stops, or include a night ending.
- Route quality targets from the Route Experience Quality Rules.

The blueprint must be abstract. It may say `classic lakeside landmark`, `photo-friendly old street`, or `local snack stop`, but it must not name a specific POI unless that POI came from the user's input.

### Stage 3: Amap Candidate Retrieval

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

The first implementation should use Amap keyword text search. Nearby search can be added in a follow-up iteration after the system has a reliable center point for each day or route cluster.

### Stage 4: AI Candidate Arrangement

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
- Route-level tradeoff explanation.
- Skip suggestion for tired users.
- Rain or weather substitution suggestion when candidate supply allows.

The AI response must be structured and schema-validated. The schema must only allow candidate IDs as selected stops. If the AI selects an unknown ID, duplicates too many stops, violates duration constraints, or returns malformed output, the app must discard the AI arrangement and use a deterministic rule fallback.

### Stage 5: Amap Route-Time Enrichment

For each adjacent stop pair, the system calls Amap route planning.

Default route mode:

- Walking for short citywalk legs.
- Transit is out of scope for the first implementation and can be added in a follow-up iteration when a leg exceeds a distance or time threshold.

If Amap route planning fails for a leg, the app may use the existing coordinate-based estimate for that leg and mark the leg as degraded.

### Stage 6: Route Card Assembly

The final route card combines:

- Real POI data from Amap.
- AI or rule reasons and route copy.
- Amap route-time estimates when available.
- Existing share-card fields.
- Source and confidence metadata.
- User-facing explanations and adjustment hints.

## Route Card Explanation Requirements

Route cards should answer the questions a user naturally has before leaving:

- Why this route fits me.
- Why the stops are in this order.
- What the best moment or highlight of the route is.
- Where the route may be tiring, risky, closed, crowded, or weather-sensitive.
- What to skip if the user is tired.
- What to replace if the weather changes.

The first implementation can show these as compact sections in the existing card:

- `路线构思`
- `这样安排的原因`
- `太累就跳过`
- `天气变化备选`

These sections should be generated from validated route data and candidate POIs. They must not introduce new unvalidated places.

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
- `intentSummary?: string`
- `blueprintSummary?: string`
- `arrangementReason?: string`
- `skipSuggestion?: string`
- `weatherAlternative?: string`
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

1. OpenAI intent or blueprint failure -> generate rule-based search slots from the theme catalog.
2. Amap POI failure or missing key -> local seed fallback.
3. OpenAI arrangement failure -> deterministic arrangement using scored Amap candidates.
4. Amap route-time failure -> coordinate-based leg estimate for that leg.

The UI should surface source and degraded warnings, but not expose raw provider errors.

User-facing degraded copy should be specific but calm:

- Missing Amap key: `当前使用本地示例数据，适合体验产品流程；出发前请核对真实地点。`
- Amap POI success but OpenAI failure: `已使用真实地图地点，路线顺序由规则生成。`
- Amap route-time failure: `部分路程时间为估算，实际以地图导航为准。`
- Candidate supply too thin: `当前条件下可选点位较少，路线已尽量保持可走性。`

## Adjustment Loop

Real planning should not be one-shot. The architecture should preserve enough structured state to support local regeneration later.

First implementation scope:

- Regenerate the whole route from current preferences, using the new real pipeline.

Follow-up-ready adjustment intents:

- Make it more relaxed.
- Reduce walking.
- Add more food.
- Add more photo spots.
- Replace one stop.
- Convert to rainy-day version.

The first implementation does not need to expose all adjustment buttons, but the route blueprint, candidate pool, and arrangement data should make these future actions straightforward.

## Real-World Data Boundaries

Real map data is not the same as guaranteed real-time availability.

The product must not imply certainty for:

- Opening hours.
- Temporary closure.
- Queue length.
- Ticket or reservation requirements.
- Weather disruption.
- Actual travel time at departure.

Route cards should include a concise boundary statement when using real providers: `地点来自地图服务，营业/预约/交通以出发前实时信息为准。`

## Testing

Automated tests should cover:

- AI blueprint schema parsing.
- AI intent extraction fallback from short notes.
- Search-slot to Amap query mapping.
- Amap POI response normalization.
- AI arrangement whitelist validation.
- Unknown AI-selected candidate IDs are rejected.
- Duplicate AI-selected candidate IDs are rejected.
- Arrangement quality constraints reject too many stops or missing day assignments.
- Amap route-time response normalization.
- Missing keys fall back without crashing.
- Generate API returns a route card in all fallback modes.
- Route explanation fields do not introduce POIs outside selected or alternative candidate IDs.

Provider calls should be tested through injectable clients and fixtures. Unit tests must not require real Amap or OpenAI credentials.

Manual verification should cover:

- With no keys: current local generation still works.
- With only Amap key: real POIs appear and the source label says rule planning.
- With Amap and OpenAI keys: real POIs appear, AI route copy appears, and selected POIs are all from the provider candidate pool.
- Two-day route shows day-level planning intent.
- Route card explains why the route fits the note and what to skip if tired.

## Implementation Notes

Introduce focused modules instead of expanding `planner.ts` into a provider-heavy file:

- `src/server/amap-client.ts`: low-level Amap HTTP calls.
- `src/server/openai-route-client.ts`: low-level OpenAI structured-output calls.
- `src/domain/route-blueprint.ts`: blueprint types, schemas, and fallback slot generation.
- `src/domain/route-arrangement.ts`: AI arrangement types, validation, and rule fallback arrangement.
- `src/domain/user-intent.ts`: user intent types and fallback extraction from theme and note.
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
- The route card explains fit, order, skip suggestion, weather alternative, and real-data limitations in user language.
