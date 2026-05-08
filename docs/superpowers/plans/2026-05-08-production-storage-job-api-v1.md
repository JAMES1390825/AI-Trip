# Production Storage And Job API V1 Implementation Plan

**Goal:** Wire the production data platform into the live Next.js API surface
without breaking the current local planning experience.

**Scope:**

- Add a route-card store factory so route cards can use SQLite by default or
  PostgreSQL through `ROUTE_CARD_STORE=postgres`.
- Add a Prisma client singleton for production-backed repositories.
- Add a planning job repository/service boundary.
- Add `POST /api/planning-jobs` and `GET /api/planning-jobs/:id`.
- Keep synchronous route generation unchanged for this slice; the worker
  consumer that executes queued jobs is the next slice.

**Non-goals:**

- Do not remove the SQLite transition store yet.
- Do not start a RocketMQ consumer in the web process.
- Do not migrate the UI to async job polling in this slice.

## Verification

- Targeted TDD tests cover store selection, Prisma job row mapping, queue
  success/failure behavior, and planning job HTTP handlers.
- Full verification must include Prisma client generation before typecheck.
