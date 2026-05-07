# Route Planner UI Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce duplicated creation-stage UI so the left panel is a focused trip creation flow and post-generation actions live in the result workspace.

**Architecture:** Keep `RoutePlannerApp` as the current owning component. Change render structure only: left panel becomes `trip-creation-panel` with mode, dates, chips, natural-language input, optional import, advanced constraints, generate, status, and progress. Right panel owns empty guidance, saved trips, result actions, route revision, and share packaging.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, CSS in `app/globals.css`.

---

## File Structure

- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: add and update server-rendered assertions for the simplified creation flow.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: move saved trips and revision controls to the right workspace, remove duplicate home/create wrapper copy, hide invalid save action before generation.
- Modify `apps/web/app/globals.css`: add focused creation panel styles, compact mode tabs, right-side saved trip panel, and result-only action spacing.

## Tasks

### Task 1: Lock Product Behavior With Tests

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`

- [ ] **Step 1: Add failing assertions for simplified create flow**

Update existing tests to assert:

```ts
assert.match(markup, /一句话开始规划/);
assert.match(markup, /可选：补充真实约束/);
assert.match(markup, /你的行程结果会出现在这里/);
assert.doesNotMatch(markup, /保存当前行程/);
assert.doesNotMatch(markup, /调整路线/);
```

- [ ] **Step 2: Run the focused component tests**

Run:

```bash
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: FAIL because the old UI still renders duplicate panels and pre-result save/revision actions.

### Task 2: Restructure RoutePlannerApp Markup

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`

- [ ] **Step 1: Replace left-side home/create wrapper with one focused create panel**

Render a single left panel with:

- heading: `一句话开始规划`
- mode tabs: `创建新计划`, `智能导入地点/行程`, disabled `采集识别`
- city/date fields
- preference chips
- natural-language textarea
- import workbench only when import mode is active
- advanced constraints section
- only one primary action: `生成真实行程`
- status and planning progress stream

- [ ] **Step 2: Move saved trips to right empty/result workspace**

Show saved trips below the empty preview or below the generated route workspace. Keep load/delete behavior unchanged.

- [ ] **Step 3: Move revision controls to result-only area**

Render the revision panel only when `routeCard` exists, after the route card and result actions.

- [ ] **Step 4: Remove pre-result save action**

Keep `save` available only in the right result actions after a route is generated.

### Task 3: Refresh Styling

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add focused creation styles**

Add classes:

- `.trip-creation-panel`
- `.create-mode-tabs`
- `.natural-language-panel`
- `.advanced-fields-panel`
- `.workspace-sidebar`

- [ ] **Step 2: Reduce visual weight of saved trips**

Style saved trips as a compact right-side shelf, not part of the creation form.

### Task 4: Verify

**Files:**
- All modified files

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css docs/superpowers/plans/2026-05-07-route-planner-ui-dedupe.md
git commit -m "feat: simplify planner creation flow"
```
