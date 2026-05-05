# ADR-002: Node Web Mainline

- Date: 2026-05-05
- Status: Active

## Context

The product direction has shifted from Go backend + iOS app to a C-end Web product for citywalk route cards.

## Decision

Adopt a single Node/TypeScript Web full-stack runtime in `apps/web`.

## Consequences

Positive:

- Faster iteration for C-end Web route-card validation.
- One language across UI, API, and domain logic.
- Easier share-card and route-detail distribution through URLs.

Trade-offs:

- Native iOS map SDK work is retired from the active mainline.
- Go backend persistence and tests are replaced by Node equivalents.
- Production-grade persistence remains a later step.
