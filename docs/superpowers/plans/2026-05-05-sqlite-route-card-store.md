# SQLite Route Card Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JSON route-card persistence with SQLite while preserving existing APIs.

**Architecture:** Keep the `RouteCardStore` interface and route handlers unchanged. Reimplement `createRouteCardStore` using `node:sqlite`, storing summary columns plus the full route-card JSON payload.

**Tech Stack:** Next.js, TypeScript, Node 25 `node:sqlite`, Node test runner.

---

## File Structure

- Modify `apps/web/src/server/route-card-store.ts`: SQLite-backed implementation.
- Modify `apps/web/src/server/route-card-store.test.ts`: SQLite persistence tests.
- Modify `apps/web/app/api/route-cards/route.test.ts`: use `ROUTE_CARD_DATABASE_FILE`.
- Modify `apps/web/app/api/route-cards/route-detail.test.ts`: use `ROUTE_CARD_DATABASE_FILE`.
- Modify `.env.example`: rename route-card storage env to `ROUTE_CARD_DATABASE_FILE`.
- Modify `README.md` and product docs: document SQLite storage.

## Task 1: Store Tests

- [ ] **Step 1: Update failing store tests**

Change `apps/web/src/server/route-card-store.test.ts` to use a `.sqlite` path, assert the file exists after save, and create a second store instance to prove persistence.

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- src/server/route-card-store.test.ts`

Expected: FAIL because the current store writes JSON and does not create the expected SQLite behavior.

- [ ] **Step 3: Implement SQLite store**

Modify `apps/web/src/server/route-card-store.ts` to use `node:sqlite`:

- import `DatabaseSync`
- initialize schema
- save with upsert
- list summaries from columns
- get by parsing `payload`
- delete by `changes > 0`

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/web && npm test -- src/server/route-card-store.test.ts`

Expected: PASS.

## Task 2: API Tests And Env

- [ ] **Step 1: Update API tests**

Replace `ROUTE_CARD_DATA_FILE` with `ROUTE_CARD_DATABASE_FILE` and `.sqlite` filenames.

- [ ] **Step 2: Run API tests**

Run: `cd apps/web && npm test -- app/api/route-cards/route.test.ts app/api/route-cards/route-detail.test.ts`

Expected: PASS.

- [ ] **Step 3: Update docs/env**

Update `.env.example`, `README.md`, and product docs to say saved route cards use SQLite.

## Task 3: Verification

- [ ] **Step 1: Run full verification**

Run: `bash scripts/dev.sh verify`

Expected: typecheck passes, all tests pass, Next build passes.

- [ ] **Step 2: Commit**

Run:

```bash
git add .
git commit -m "feat: store route cards in sqlite"
```
