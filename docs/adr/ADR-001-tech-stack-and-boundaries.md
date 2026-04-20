# ADR-001: Tech Stack and Service Boundaries

- Date: 2026-04-20
- Status: Active

## Context

The repository is being reset to one current delivery line:

- AI trip planning with server-side save/review
- one active backend: `trip-api-go`
- one active client: `mobile-ios`
- in-process AI capability inside Go rather than a separate Python runtime
- a macOS-first local development path

## Decision

Adopt the following active delivery boundary:

1. `trip-api-go` (Go)
- Owns the external API boundary, provider/model orchestration, itinerary validation, save/review persistence, and current server truth.

2. `mobile-ios` (React Native + Expo)
- Owns the only active end-user client experience for planning and saved-trip review.

Retired from the current boundary:

- `trip-ai-service`
- `web-client`
- Windows/PowerShell development scripts

## Consequences

Positive:

- The system now has one server truth boundary for planning, save/review, and AI orchestration.
- Local development and deployment no longer depend on coordinating separate Python or Web runtimes.
- iOS and Go are the only active runtime contract that must remain current.

Trade-offs:

- Any future Web, community, or personalization restart must be proposed as a new product line rather than assumed as latent scope.
- AI integration now shares the Go service release and operational lifecycle.
- macOS-first tooling is the only supported active development path for this mainline.

## Scope Guardrails

- Current mainline covers AI planning and saved-trip review only.
- Server-side save/review remains the recovery path for reopening trips across devices.
- Community, learning, and personalization are not active scope for this line.
- Python AI service and Web are retired components, not shadow dependencies.
