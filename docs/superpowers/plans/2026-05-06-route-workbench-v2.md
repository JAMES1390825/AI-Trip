# Route Workbench v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route revision so users can adjust a generated route card with quick actions or free text.

**Architecture:** Keep generation intact. Add a revise domain helper and a new `/api/route-cards/revise` route that calls the existing real planner with an enriched note. Add a small workbench UI under the current route card.

**Tech Stack:** Next.js, TypeScript, React, Node test runner, existing Amap + AI provider planner.

---

## File Structure

- Modify `apps/web/src/domain/types.ts`: add `revisionNote` and `revisionSummary` optional fields.
- Create `apps/web/src/domain/route-revision.ts`: revision helper.
- Create `apps/web/src/domain/route-revision.test.ts`: helper tests.
- Create `apps/web/app/api/route-cards/revise/route.ts`: revise API route.
- Create `apps/web/app/api/route-cards/revise/route.test.ts`: API tests.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: add revise UI and handler.
- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: render coverage.
- Modify docs to mention route workbench v2.

## Task 1: Domain Revision Helper

- [ ] **Step 1: Write failing helper test**

Create `apps/web/src/domain/route-revision.test.ts` that injects a fake planner and asserts the revised card receives an enriched note plus `revisionNote` and `revisionSummary`.

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- src/domain/route-revision.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper**

Create `route-revision.ts` with `reviseRouteCard` and optional planner dependency.

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/web && npm test -- src/domain/route-revision.test.ts`

Expected: PASS.

## Task 2: Revise API

- [ ] **Step 1: Write failing API tests**

Create `apps/web/app/api/route-cards/revise/route.test.ts` for valid request and missing note.

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- app/api/route-cards/revise/route.test.ts`

Expected: FAIL because API route does not exist.

- [ ] **Step 3: Implement API route**

Create `apps/web/app/api/route-cards/revise/route.ts`.

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/web && npm test -- app/api/route-cards/revise/route.test.ts`

Expected: PASS.

## Task 3: UI Workbench

- [ ] **Step 1: Update render test**

Add assertions for "调整路线", "少走路", and "重新调整路线" in `RoutePlannerApp.test.ts`.

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- src/components/RoutePlannerApp.test.ts`

Expected: FAIL until UI exists.

- [ ] **Step 3: Implement UI**

Add revision note state, quick action buttons, and `reviseRoute` fetch handler.

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/web && npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

## Task 4: Docs And Verification

- [ ] **Step 1: Update docs**

Mention `POST /api/route-cards/revise` and workbench behavior.

- [ ] **Step 2: Run full verification**

Run: `bash scripts/dev.sh verify`

Expected: typecheck, tests, and build pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add .
git commit -m "feat: add route revision workbench"
```
