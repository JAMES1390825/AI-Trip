# ADR-001: Tech Stack and Service Boundaries

- Date: 2026-03-11
- Status: Amended on 2026-03-31

## Context

The current product requires:

- a stable backend for auth, saved plans, event tracking, planning orchestration, validation, and storage;
- an isolated AI integration layer that can evolve prompts / models without taking over factual planning truth;
- an iOS-first user experience plus a lightweight admin console;
- local single-machine startup with independently launched services;
- a roadmap toward feedback loops, aggregate signals, and future community data without mixing those concerns into the factual planning core.

## Decision

Adopt the following active delivery boundary:

1. `trip-api-go` (Go)
- Owns the external API boundary and business workflows.
- Owns planning brief normalization, candidate retrieval, deterministic scoring, itinerary assembly, validation, auth, event tracking, and local persistence.
- Acts as the source of truth for factual planning state and user-owned data.

2. `trip-ai-service` (Python)
- Owns model integration and prompt orchestration.
- Enhances brief understanding, chat intake wording, and itinerary explain surfaces.
- Does not own final factual POI truth, route truth, weather truth, or cross-user ranking logic.

3. `mobile-ios` (React Native + Expo)
- Owns the end-user mobile planning flow and execution UX.
- Collects user input, planning context, and later feedback / community actions.

4. `web-client` (React + Vite)
- Owns admin / operations workflows and inspection surfaces.
- Continues to be useful for local debugging, contract inspection, and operations support.

## Consequences

Positive:

- The factual planning core stays deterministic and auditable in Go.
- AI capabilities can evolve independently without becoming the truth source for itinerary facts.
- Mobile and admin clients can iterate independently while sharing a single backend contract.
- Local startup remains simple and does not require container orchestration by default.

Trade-offs:

- More boundary discipline is required between deterministic planning and AI explain layers.
- File-backed local persistence remains suitable for development only, not production-grade HA.
- Feedback, aggregate learning, and future community capabilities should be added as logically separated modules rather than mixed directly into the planning core.

## Scope Guardrails

- Current mainline remains Mainland China single-city trip planning first.
- Community, public routes, and cross-user learning are roadmap items and should be introduced with explicit privacy and aggregation boundaries.
- Personal feedback is private by default; only aggregate or explicitly public data may cross user boundaries.
- The model layer remains post-fact and post-validation, not a replacement for provider-grounded planning.
