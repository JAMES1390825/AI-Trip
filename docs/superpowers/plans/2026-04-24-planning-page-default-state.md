# Planning Page Default State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the planning page into the approved default state: native map background, medium-height bottom sheet, inline destination search, inline date-range calendar, soft style tags, and light missing-field feedback.

**Architecture:** Keep the existing planning/generation/result backend contract, but shift the planning entry UI away from multi-surface mode switches into a single map-backed composition. Extract the new date-range and required-field logic into a pure helper with tests, then wire `MapFlowScreen` and `PlanEntryView` to use inline destination search and inline calendar expansion instead of separate search/date flows.

**Tech Stack:** React Native + Expo, TypeScript, `node:test`, existing mobile unit-test runner, repo `verify-fast`

---

## Scope Check

This plan covers one sub-project:

1. Planning page default-state implementation for the mobile app

It does not redesign the result page, change backend APIs, or alter saved-trip behavior, so it should stay in one implementation plan.

## File Map

- `apps/mobile-ios/src/screens/map/planning-page-default-state.ts`
  New pure helper for required-field validation, missing-field summaries, date-range derivation, and soft style-tag state helpers.
- `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`
  Unit tests for the new planning-page helper, especially date-range and missing-field logic.
- `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
  Replace route-to-search/date modes with inline destination search state and inline date-range state, while keeping generate/result flow intact.
- `apps/mobile-ios/src/screens/map/PlanEntryView.tsx`
  Redesign the planning UI into the approved default state: map-sheet layout, inline destination search, inline calendar expansion, soft style tags, collapsed optional note, and lightweight top feedback.

## Task 1: Add And Test The Default-State Logic Helper

**Files:**
- Create: `apps/mobile-ios/src/screens/map/planning-page-default-state.ts`
- Create: `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`
- Test: `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanningEntryFeedback,
  deriveDaysFromRange,
  isPlanningEntryReady,
} from "./planning-page-default-state";

test("isPlanningEntryReady requires destination and date range only", () => {
  assert.equal(
    isPlanningEntryReady({
      destination: "上海",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    }),
    true,
  );

  assert.equal(
    isPlanningEntryReady({
      destination: "",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    }),
    false,
  );
});

test("deriveDaysFromRange returns inclusive day count", () => {
  assert.equal(deriveDaysFromRange("2026-05-01", "2026-05-03"), 3);
  assert.equal(deriveDaysFromRange("2026-05-01", "2026-05-01"), 1);
});

test("buildPlanningEntryFeedback returns destination-first message", () => {
  const feedback = buildPlanningEntryFeedback({
    destination: "",
    startDate: "",
    endDate: "",
  });

  assert.equal(feedback.message, "请先补充目的地");
  assert.equal(feedback.focusField, "destination");
});

test("buildPlanningEntryFeedback points to date when destination exists but range is incomplete", () => {
  const feedback = buildPlanningEntryFeedback({
    destination: "杭州",
    startDate: "2026-05-01",
    endDate: "",
  });

  assert.equal(feedback.message, "请选择开始和结束日期");
  assert.equal(feedback.focusField, "date_range");
});
```

- [ ] **Step 2: Run the tests to confirm the helper is missing**

Run: `cd apps/mobile-ios && npm run test`

Expected: FAIL with `Cannot find module './planning-page-default-state'`.

- [ ] **Step 3: Implement the minimal helper**

Create `apps/mobile-ios/src/screens/map/planning-page-default-state.ts`:

```ts
export type PlanningEntryFeedback = {
  ready: boolean;
  message: string;
  focusField: "destination" | "date_range" | null;
};

type PlanningEntryState = {
  destination: string;
  startDate: string;
  endDate: string;
};

function normalize(value: string): string {
  return String(value || "").trim();
}

function parseDate(value: string): number | null {
  const ts = Date.parse(normalize(value));
  return Number.isFinite(ts) ? ts : null;
}

export function deriveDaysFromRange(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start === null || end === null || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function isPlanningEntryReady(state: PlanningEntryState): boolean {
  return Boolean(normalize(state.destination)) && deriveDaysFromRange(state.startDate, state.endDate) > 0;
}

export function buildPlanningEntryFeedback(state: PlanningEntryState): PlanningEntryFeedback {
  if (!normalize(state.destination)) {
    return { ready: false, message: "请先补充目的地", focusField: "destination" };
  }

  if (deriveDaysFromRange(state.startDate, state.endDate) <= 0) {
    return { ready: false, message: "请选择开始和结束日期", focusField: "date_range" };
  }

  return { ready: true, message: "", focusField: null };
}
```

- [ ] **Step 4: Run the tests to verify the helper passes**

Run: `cd apps/mobile-ios && npm run test`

Expected: PASS with the new default-state helper tests.

- [ ] **Step 5: Commit the helper**

```bash
git add apps/mobile-ios/src/screens/map/planning-page-default-state.ts apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts
git commit -m "feat: add planning page default state logic"
```

## Task 2: Refactor `MapFlowScreen` For Inline Destination Search And Date Range

**Files:**
- Modify: `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
- Test: `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`

- [ ] **Step 1: Extend the helper tests to lock the invalid-range case before wiring UI**

Append to `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`:

```ts
test("deriveDaysFromRange returns 0 for inverted ranges", () => {
  assert.equal(deriveDaysFromRange("2026-05-03", "2026-05-01"), 0);
});
```

- [ ] **Step 2: Run the tests to confirm the helper still drives range behavior**

Run: `cd apps/mobile-ios && npm run test`

Expected: PASS, proving the range helper is stable before UI wiring.

- [ ] **Step 3: Update `MapFlowScreen.tsx` to manage inline destination/date state**

Make these changes:

1. Remove `flowMode === "search"` usage and stop rendering `DestinationSearchView`.
2. Replace `showDatePicker` with:

```ts
const [destinationSearchOpen, setDestinationSearchOpen] = useState(false);
const [dateRangeOpen, setDateRangeOpen] = useState(false);
const [endDate, setEndDate] = useState("");
```

3. Import the helper:

```ts
import {
  buildPlanningEntryFeedback,
  deriveDaysFromRange,
  isPlanningEntryReady,
} from "./planning-page-default-state";
```

4. Derive `days` from `startDate` and `endDate` whenever both are valid:

```ts
useEffect(() => {
  const nextDays = deriveDaysFromRange(startDate, endDate);
  if (nextDays > 0 && nextDays !== days) {
    setDays(nextDays);
  }
}, [days, endDate, startDate]);
```

5. Build `entryFeedback` via `useMemo`:

```ts
const entryFeedback = useMemo(
  () =>
    buildPlanningEntryFeedback({
      destination,
      startDate,
      endDate,
    }),
  [destination, endDate, startDate],
);
```

6. Before `handleSmartGenerate` sends the brief, short-circuit on missing destination/date:

```ts
if (!isPlanningEntryReady({ destination, startDate, endDate })) {
  setEntryStatus(entryFeedback.message);
  if (entryFeedback.focusField === "destination") {
    setDestinationSearchOpen(true);
  }
  if (entryFeedback.focusField === "date_range") {
    setDateRangeOpen(true);
  }
  return;
}
```

7. Update `buildPlanningBriefRequest` to keep using `days`, now derived from the date range.

8. Pass the new inline state into `PlanEntryView`:

```tsx
destinationSearchOpen={destinationSearchOpen}
dateRangeOpen={dateRangeOpen}
endDate={endDate}
entryFeedback={entryFeedback}
onToggleDestinationSearch={() => setDestinationSearchOpen((prev) => !prev)}
onToggleDateRange={() => setDateRangeOpen((prev) => !prev)}
onChangeDestination={setDestination}
onSelectDestination={(value) => {
  setSelectedDestination(value);
  setDestination(value.destination_label);
  setDestinationSearchOpen(false);
}}
onSelectStartDate={setStartDate}
onSelectEndDate={setEndDate}
```

- [ ] **Step 4: Run tests and typecheck after the screen-state refactor**

Run:

```bash
cd apps/mobile-ios && npm run test
cd apps/mobile-ios && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the screen-state refactor**

```bash
git add apps/mobile-ios/src/screens/map/MapFlowScreen.tsx apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts
git commit -m "refactor: prepare planning screen for default state layout"
```

## Task 3: Rebuild `PlanEntryView` Into The Approved Default State

**Files:**
- Modify: `apps/mobile-ios/src/screens/map/PlanEntryView.tsx`
- Test: `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`

- [ ] **Step 1: Add one more helper test for the ready state**

Append to `apps/mobile-ios/src/screens/map/planning-page-default-state.test.ts`:

```ts
test("buildPlanningEntryFeedback clears message when destination and date range are complete", () => {
  const feedback = buildPlanningEntryFeedback({
    destination: "上海",
    startDate: "2026-05-01",
    endDate: "2026-05-03",
  });

  assert.equal(feedback.ready, true);
  assert.equal(feedback.message, "");
});
```

- [ ] **Step 2: Run tests before the UI rewrite**

Run: `cd apps/mobile-ios && npm run test`

Expected: PASS.

- [ ] **Step 3: Replace `PlanEntryView.tsx` with the default-state layout**

Implement these UI changes:

1. Remove the current hero copy block and the old guidance card.
2. Use a more minimal top area:

```tsx
<View style={styles.sheetHeader}>
  <Text style={styles.sheetTitle}>开始规划</Text>
  <Text style={styles.sheetSub}>{entryFeedback.ready ? "先确定目的地、日期和风格" : entryFeedback.message}</Text>
</View>
```

3. Turn destination into an inline expandable card:

```tsx
<View style={styles.inputCard}>
  <Pressable style={styles.rowButton} onPress={onToggleDestinationSearch}>
    <Text style={destination ? styles.rowValue : styles.rowPlaceholder}>{destination || "目的地"}</Text>
  </Pressable>
  {destinationSearchOpen ? (
    <View style={styles.inlinePanel}>
      <TextInput ... />
      {/* lightweight result list rendered from props */}
    </View>
  ) : null}
</View>
```

4. Turn date into a single expandable range card:

```tsx
<View style={styles.inputCard}>
  <Pressable style={styles.rowButton} onPress={onToggleDateRange}>
    <Text style={startDate && endDate ? styles.rowValue : styles.rowPlaceholder}>
      {startDate && endDate ? `${startDate} - ${endDate}` : "日期"}
    </Text>
  </Pressable>
  {dateRangeOpen ? (
    <View style={styles.inlineCalendar}>
      {/* quick date chips for start + end in this first implementation */}
    </View>
  ) : null}
</View>
```

5. Keep the style tags visible by default, but make them light and togglable.
6. Collapse the note field behind a small entry row:

```tsx
<Pressable style={styles.optionalRow}>补充要求（可选）</Pressable>
```

7. Rename the primary button to:

```tsx
<Text style={styles.primaryButtonText}>开始生成</Text>
```

8. Remove budget/pace blocks from the default visible state for this implementation.

- [ ] **Step 4: Run the full verification stack**

Run:

```bash
cd apps/mobile-ios && npm run test
cd apps/mobile-ios && npm run typecheck
bash scripts/dev.sh verify-fast
```

Expected: PASS across all three commands.

- [ ] **Step 5: Commit the default-state UI**

```bash
git add apps/mobile-ios/src/screens/map/PlanEntryView.tsx
git commit -m "feat: implement planning page default state"
```

## Task 4: Save The Plan And Design Updates

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-planning-page-travel-product-default-state-design.md`
- Create: `docs/superpowers/plans/2026-04-24-planning-page-default-state.md`

- [ ] **Step 1: Ensure the design doc still matches the implementation choices**

Run: `sed -n '1,260p' docs/superpowers/specs/2026-04-24-planning-page-travel-product-default-state-design.md`

Expected: The document still says destination and date are the only required inputs, style tags are soft selections, optional notes start collapsed, and missing-field feedback is light.

- [ ] **Step 2: Commit the implementation plan**

```bash
git add docs/superpowers/specs/2026-04-24-planning-page-travel-product-default-state-design.md docs/superpowers/plans/2026-04-24-planning-page-default-state.md
git commit -m "docs: add planning page default state implementation plan"
```
