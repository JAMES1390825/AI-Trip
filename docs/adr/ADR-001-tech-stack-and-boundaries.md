# ADR-001: Tech Stack and Service Boundaries

- Date: 2026-03-11
- Status: Amended (Go backend + React frontend only path on 2026-03-17)

## Context

The product requires:

- high-stability business backend for account-centric flows, persistence, and analytics;
- fast iteration on AI planning algorithms and prompt/data orchestration within the same delivery unit;
- support for hour-level executable itineraries with partial replanning and fallback;
- frontend/backend independent startup for local development without Docker-coupled orchestration.

## Decision

Adopt a Go + React full-stack delivery boundary:

1. `trip-api` (Go)
- Owns external API boundary and business workflows.
- Performs request validation, auth boundary, event tracking, and planning/replanning logic.
- Starts via local command (`go run`) without mandatory Docker dependencies.
- Persists local runtime data to a file-backed store by default.

2. `web-client` (React + Vite)
- Owns user-facing planning workflows and operations configuration screens.
- Integrates with `trip-api` APIs through configurable base URL.
- Starts via local command (`npm run dev`) independently from backend startup.

## Consequences

Positive:

- Lower local startup friction (frontend/backend independent commands).
- Reduced dependency on local Docker runtime for daily development.
- Single active backend runtime and language for delivery.
- Repository boundary now matches active delivery stack (Go + React only).
- Local saved plans and event records can survive service restart.

Trade-offs:

- File-backed local persistence is suitable for development but not production-grade HA.
- Requires a dedicated database integration later for production-hardening.

## Scope Guardrails

- V1 excludes community, Xiaohongshu publishing, and booking transactions.
- V1 supports Mainland China single-city trips only.
- V1 client is web-first (React).
