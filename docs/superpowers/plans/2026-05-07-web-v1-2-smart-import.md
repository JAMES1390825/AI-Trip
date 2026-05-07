# Web V1.2 Smart Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn smart import into a real Web creation entry that parses messy trip text, previews an editable draft, and applies it to the existing planner fields.

**Architecture:** Add a deterministic domain parser that returns a `TripImportDraft`, keep parsing client-side inside `RoutePlannerApp`, and reuse the existing generation API after applying parsed fields. The UI gains an import draft panel without adding new persistence or API surfaces.

**Tech Stack:** Next.js App Router, React client component state, TypeScript domain modules, Node test runner, existing CSS design system.

---

## File Structure

- Modify `apps/web/src/domain/types.ts`: add `TripImportDraft`.
- Create `apps/web/src/domain/trip-import-parser.ts`: parse imported text into a draft.
- Create `apps/web/src/domain/trip-import-parser.test.ts`: cover city, places, constraints, preferences, dedupe, empty input.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: add import parsing state, draft panel, and apply action.
- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: verify import draft copy and actions render.
- Modify `apps/web/app/globals.css`: style import draft panel and recognized chips.

## Tasks

### Task 1: Deterministic Import Parser

**Files:**
- Modify: `apps/web/src/domain/types.ts`
- Create: `apps/web/src/domain/trip-import-parser.ts`
- Create: `apps/web/src/domain/trip-import-parser.test.ts`

- [ ] **Step 1: Write parser tests**

Create tests that expect `parseTripImportText` to return city hints, deduped places, avoid constraints, preference chips, and confidence.

Run: `npm test -- src/domain/trip-import-parser.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Add `TripImportDraft` type and parser implementation**

Add a `TripImportDraft` type to `types.ts` and implement rule-based parsing:

- cap raw text to 800 characters,
- recognize cities from supported city names,
- split place candidates by Chinese punctuation, arrows, spaces, and line breaks,
- remove instruction phrases such as `朋友推荐`, `想去`, `必去`,
- detect avoid lines containing `不要`, `别`, `避开`, `少排队`, `少走路`, `别太累`, `不赶`,
- detect preferences from keywords like `拍照`, `小吃`, `亲子`, `citywalk`, `历史`, `自然`, `室内`, `预算`,
- dedupe places while preserving order,
- produce parse notes and confidence.

Run: `npm test -- src/domain/trip-import-parser.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/domain/types.ts apps/web/src/domain/trip-import-parser.ts apps/web/src/domain/trip-import-parser.test.ts
git commit -m "feat: parse imported trip text"
```

### Task 2: Smart Import Draft UI

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write UI tests**

Extend `RoutePlannerApp.test.ts` to assert the static UI includes:

- `识别导入内容`,
- `导入识别草稿`,
- `应用到规划表单`,
- `识别地点`,
- `识别约束`.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: FAIL until UI is added.

- [ ] **Step 2: Add parser state and UI panel**

In `RoutePlannerApp.tsx`:

- import `parseTripImportText`,
- add `importDraft` state,
- add `parseImportedText()` action,
- show draft panel in import mode,
- render recognized places, constraints, preferences, parse notes, and confidence,
- keep generation endpoint unchanged.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 3: Add apply action**

Add `applyImportDraft()` that:

- sets `city` from `draft.cityHint`,
- merges `draft.preferenceHints` into selected chips,
- appends `draft.placeNames` to `mustVisitText`,
- appends `draft.avoidText` to `avoidText`,
- appends `draft.noteHint` to `note`,
- applies start/end hints when present,
- updates status with an applied message.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 4: Style the import draft panel**

Add CSS for:

- `.import-draft-panel`,
- `.import-draft-grid`,
- `.import-chip-row`,
- `.import-chip`,
- `.import-confidence`,
- mobile stacking.

Run: `npm test -- src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: apply smart import drafts to planner"
```

### Task 3: Verification

**Files:**
- No new source files unless verification exposes a defect.

- [ ] **Step 1: Full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, full Node tests, and Next build all PASS.

- [ ] **Step 2: Browser smoke**

Run dev server and verify:

- page opens on `http://localhost:3000`,
- import mode shows parser controls,
- pasted text can be recognized,
- applying draft updates planner fields,
- generated route still shows quality summary.

- [ ] **Step 3: Final status**

Confirm git status is clean except any intentionally running dev server and report verification output.

## Self-Review

- Spec coverage: Tasks 1-3 cover parser, draft UI, apply action, existing generation reuse, tests, and verification.
- Placeholder scan: no TBD or vague implementation placeholders remain.
- Type consistency: `TripImportDraft`, `parseTripImportText`, `importDraft`, and `applyImportDraft` names are consistent.
