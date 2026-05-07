# Web V1.3 App Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape AI Trip into a video-inspired Web app flow with a My Trips home, focused create panel, live planning stages, and map-plus-daily-itinerary result orientation.

**Architecture:** Keep the current Next.js app and APIs. Refactor `RoutePlannerApp` local UI state to separate home/create/result surfaces while preserving generation, smart import, revision, save, and route card behavior. Add a small client-side planning stage state machine.

**Tech Stack:** Next.js App Router, React client state, TypeScript, Node test runner, existing CSS.

---

## File Structure

- Modify `apps/web/src/components/RoutePlannerApp.tsx`: add home/create panel state, planning stage state, app-shell markup.
- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: cover My Trips home, create panel render, planning stage labels, result orientation copy.
- Modify `apps/web/app/globals.css`: add app-home, create panel, create dock, progress state, and mobile app shell styles.

## Tasks

### Task 1: App Home And Create Panel

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add tests for My Trips home and create panel copy**

Add tests asserting:

- `我的行程` is visible as the home surface.
- `+ 创建新行程` is visible.
- `最近行程` or empty-state copy is visible.
- create panel copy includes `轻创建面板`.
- existing create modes remain visible.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: FAIL until UI copy is added.

- [ ] **Step 2: Add `createPanelOpen` state and restructure top markup**

Add local state:

```ts
const [createPanelOpen, setCreatePanelOpen] = useState(false);
```

Render a home section above the planner controls and wrap planner controls in:

```tsx
<section className={createPanelOpen ? "create-panel create-panel--open" : "create-panel"} aria-label="轻创建面板">
```

Keep controls mounted for tests and simplicity, but visually distinguish open/closed states.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 3: Add home/create CSS**

Add `.app-home`, `.home-trip-card`, `.create-dock`, `.create-panel`, `.create-panel--open` styles and mobile rules.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: introduce my trips app home"
```

### Task 2: Live Planning Progress

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add tests for progress states**

Assert static markup includes:

- `规划进度流`,
- `等待开始`,
- `进行中`,
- `已完成`,
- stage labels from existing generation stages.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: FAIL until progress copy/state rendering exists.

- [ ] **Step 2: Implement planning stage state machine**

Add:

```ts
type PlanningStageState = "queued" | "active" | "done" | "error";
const [planningStageIndex, setPlanningStageIndex] = useState(-1);
const [planningStageError, setPlanningStageError] = useState(false);
```

During `generate()`:

- set stage index to `0`,
- advance through stages with a lightweight interval,
- mark all done on success,
- mark error on catch.

Render each stage with status text and state class.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 3: Add progress CSS**

Style `.planning-progress-stream`, `.progress-stage`, `.progress-stage--active`, `.progress-stage--done`, `.progress-stage--error`.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: show live planning progress stream"
```

### Task 3: Result Orientation And Verification

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add result orientation tests**

Assert markup includes:

- `地图 + 每日行程`,
- `当前旅行工作台`,
- `保存当前行程`,
- `再规划一版`.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS after copy additions.

- [ ] **Step 2: Add result heading and polish CSS**

Add a result header above `RouteCard` and tune `.preview-panel`, `.result-workspace-heading`, `.result-actions`.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 3: Full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, and build PASS.

- [ ] **Step 4: Browser smoke**

Verify on `http://localhost:3000`:

- home surface appears,
- create panel can open,
- generation still works,
- result shows map plus daily itinerary orientation.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: orient results around map and itinerary"
```

## Self-Review

- Spec coverage: tasks map to home, create panel, progress stream, result orientation, mobile styling, and verification.
- Placeholder scan: no TBD or vague implementation step remains.
- Type consistency: `createPanelOpen`, `planningStageIndex`, and `planningStageError` are used consistently.
