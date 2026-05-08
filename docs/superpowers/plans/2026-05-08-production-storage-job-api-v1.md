# Production Storage And Job API V1 Implementation Plan

**Goal:** Wire the production data platform into the live Next.js API surface
without breaking the current local planning experience.

**Scope:**

- Make route-card persistence PostgreSQL-only on the runtime path.
- Add a Prisma client singleton for production-backed repositories.
- Add a planning job repository/service boundary.
- Add `POST /api/planning-jobs` and `GET /api/planning-jobs/:id`.
- Keep synchronous route generation unchanged for this slice; the worker
  consumer that executes queued jobs is the next slice.

**Non-goals:**

- Do not keep a SQLite runtime fallback.
- Do not start a RocketMQ consumer in the web process.
- Do not migrate the UI to async job polling in this slice.

## Verification

- Targeted TDD tests cover store selection, Prisma job row mapping, queue
  success/failure behavior, and planning job HTTP handlers.
- Full verification must include Prisma client generation before typecheck.
