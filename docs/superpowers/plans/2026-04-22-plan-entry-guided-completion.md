# Plan Entry Guided Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the planning entry form into a guided completion flow that clearly shows missing brief fields and lets users directly fix destination, date, or day-count gaps before generation.

**Architecture:** Keep the backend API and overall screen flow unchanged, but extract the “what is missing / what should the user do next” rules into a pure TypeScript helper that can be unit-tested. `MapFlowScreen` stays the state coordinator, `PlanEntryView` stays the presentational form, and the new helper becomes the single source of truth for guidance text, highlights, and suggestion actions.

**Tech Stack:** React Native + Expo, TypeScript, TypeScript compiler (`tsc`), Node built-in test runner, existing `trip-mobile-ios` typecheck pipeline

---

## Scope Check

This plan covers one sub-project:

1. Guided completion for missing planning-brief fields on the mobile planning entry screen

It does not touch the result screen, backend APIs, itinerary generation, or saved-trip search, so it should stay in a single implementation plan.

## File Map

- `apps/mobile-ios/package.json`
  Add a lightweight frontend test script so we can run pure TypeScript tests before wiring UI behavior.
- `apps/mobile-ios/tsconfig.test.json`
  Compile the lightweight pure-logic test files into a temporary Node-friendly output directory.
- `apps/mobile-ios/src/screens/map/plan-entry-guidance.ts`
  New pure logic module for mapping brief gaps and suggested options into a view model and executable suggestion actions.
- `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`
  Unit tests for the pure guidance logic, covering missing destination/date/day flows and fallback note behavior.
- `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
  Use the new guidance model, store missing fields from the brief response, route guidance actions to search/date flows, and use the new suggestion parser.
- `apps/mobile-ios/src/screens/map/PlanEntryView.tsx`
  Render the guidance card and section highlights using props from `MapFlowScreen`.

## Task 1: Add A Lightweight Frontend Test Entry Point

**Files:**
- Modify: `apps/mobile-ios/package.json`
- Modify: `apps/mobile-ios/tsconfig.json`
- Create: `apps/mobile-ios/tsconfig.test.json`
- Test: `apps/mobile-ios/package.json`

- [ ] **Step 1: Confirm the mobile app does not have a test script yet**

Run: `cd apps/mobile-ios && npm run test`

Expected: FAIL with “Missing script: test”.

- [ ] **Step 2: Add the lightweight test script to `package.json`**

Update the `scripts` block to:

```json
"scripts": {
  "start": "expo start",
  "ios": "expo start --ios",
  "typecheck": "tsc --noEmit",
  "test": "rm -rf .tmp-tests && tsc -p tsconfig.test.json && node --test $(find .tmp-tests -name '*.test.js' -print)"
}
```

- [ ] **Step 3: Add a dedicated test tsconfig and exclude test files from the app tsconfig**

Create `apps/mobile-ios/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": ".tmp-tests",
    "module": "node16",
    "moduleResolution": "node16",
    "target": "es2022",
    "types": ["node"]
  },
  "include": ["src/**/*.test.ts", "src/**/*.ts"],
  "exclude": []
}
```

Update `apps/mobile-ios/tsconfig.json` to exclude test files:

```json
"exclude": ["src/**/*.test.ts"]
```

- [ ] **Step 4: Verify the new test command runs and currently fails because no test module exists**

Run: `cd apps/mobile-ios && npm run test`

Expected: FAIL because the new test command can now compile the test file, but `./plan-entry-guidance` does not exist yet.

- [ ] **Step 5: Commit the lightweight test entry point**

```bash
git add apps/mobile-ios/package.json apps/mobile-ios/tsconfig.json apps/mobile-ios/tsconfig.test.json
git commit -m "test: add lightweight mobile unit test runner"
```

## Task 2: Extract And Test The Guidance Rules As Pure Logic

**Files:**
- Create: `apps/mobile-ios/src/screens/map/plan-entry-guidance.ts`
- Create: `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`
- Test: `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`

- [ ] **Step 1: Write the failing guidance tests first**

Create `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanEntryGuidance,
  interpretSuggestedOption,
} from "./plan-entry-guidance";

test("buildPlanEntryGuidance prefers destination search when destination is missing", () => {
  const guidance = buildPlanEntryGuidance({
    missingFields: ["destination"],
    nextAction: "CONFIRM_DESTINATION",
    clarificationQuestion: "我还需要你先确认目的地城市。",
    suggestedOptions: ["杭州"],
  });

  assert.equal(guidance.needsCompletion, true);
  assert.equal(guidance.primaryAction?.kind, "OPEN_DESTINATION_SEARCH");
  assert.equal(guidance.highlights.destination, true);
  assert.equal(guidance.highlights.schedule, false);
});

test("buildPlanEntryGuidance opens the date picker when start date is missing", () => {
  const guidance = buildPlanEntryGuidance({
    missingFields: ["start_date"],
    nextAction: "CONFIRM_START_DATE",
    clarificationQuestion: "我还需要你补一个开始日期。",
    suggestedOptions: ["2026-05-01"],
  });

  assert.equal(guidance.primaryAction?.kind, "OPEN_DATE_PICKER");
  assert.equal(guidance.highlights.schedule, true);
});

test("interpretSuggestedOption extracts day count for CONFIRM_DAYS", () => {
  const action = interpretSuggestedOption("CONFIRM_DAYS", "玩 4 天");

  assert.deepEqual(action, {
    kind: "SET_DAYS",
    value: "玩 4 天",
    days: 4,
  });
});

test("interpretSuggestedOption returns a start date for CONFIRM_START_DATE", () => {
  const action = interpretSuggestedOption("CONFIRM_START_DATE", "2026-05-01");

  assert.deepEqual(action, {
    kind: "SET_START_DATE",
    value: "2026-05-01",
    startDate: "2026-05-01",
  });
});

test("interpretSuggestedOption falls back to note append when option is not directly actionable", () => {
  const action = interpretSuggestedOption("COMPLETE_FORM", "多一点本地餐馆");

  assert.deepEqual(action, {
    kind: "APPEND_NOTE",
    value: "多一点本地餐馆",
  });
});
```

- [ ] **Step 2: Run the new test file to confirm it fails correctly**

Run: `cd apps/mobile-ios && npm run test -- src/screens/map/plan-entry-guidance.test.ts`

Expected: FAIL because `./plan-entry-guidance` does not exist yet.

- [ ] **Step 3: Implement the minimal pure guidance module**

Create `apps/mobile-ios/src/screens/map/plan-entry-guidance.ts`:

```ts
export type GuidancePrimaryActionKind = "OPEN_DESTINATION_SEARCH" | "OPEN_DATE_PICKER";

export type GuidanceSuggestionAction =
  | { kind: "SET_DAYS"; value: string; days: number }
  | { kind: "SET_START_DATE"; value: string; startDate: string }
  | { kind: "SET_DESTINATION"; value: string }
  | { kind: "APPEND_NOTE"; value: string };

export type PlanEntryGuidance = {
  needsCompletion: boolean;
  message: string;
  primaryAction: { kind: GuidancePrimaryActionKind; label: string } | null;
  highlights: {
    destination: boolean;
    schedule: boolean;
    planningNote: boolean;
  };
};

type BuildPlanEntryGuidanceInput = {
  missingFields: string[];
  nextAction: string;
  clarificationQuestion: string;
  suggestedOptions: string[];
};

function normalizeText(value: string): string {
  return String(value || "").trim();
}

function normalizeMissingFields(values: string[]): string[] {
  return values.map((item) => normalizeText(item)).filter(Boolean);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

export function buildPlanEntryGuidance(input: BuildPlanEntryGuidanceInput): PlanEntryGuidance {
  const missingFields = normalizeMissingFields(input.missingFields);
  const nextAction = normalizeText(input.nextAction);
  const clarificationQuestion = normalizeText(input.clarificationQuestion);
  const needsCompletion = missingFields.length > 0;

  if (!needsCompletion) {
    return {
      needsCompletion: false,
      message: "",
      primaryAction: null,
      highlights: {
        destination: false,
        schedule: false,
        planningNote: false,
      },
    };
  }

  if (nextAction === "CONFIRM_DESTINATION" || missingFields.includes("destination")) {
    return {
      needsCompletion: true,
      message: clarificationQuestion,
      primaryAction: { kind: "OPEN_DESTINATION_SEARCH", label: "去确认目的地" },
      highlights: {
        destination: true,
        schedule: false,
        planningNote: false,
      },
    };
  }

  if (nextAction === "CONFIRM_DAYS" || nextAction === "CONFIRM_START_DATE" || missingFields.includes("days") || missingFields.includes("start_date")) {
    return {
      needsCompletion: true,
      message: clarificationQuestion,
      primaryAction: { kind: "OPEN_DATE_PICKER", label: "去补日期和天数" },
      highlights: {
        destination: false,
        schedule: true,
        planningNote: false,
      },
    };
  }

  return {
    needsCompletion: true,
    message: clarificationQuestion,
    primaryAction: null,
    highlights: {
      destination: false,
      schedule: false,
      planningNote: true,
    },
  };
}

export function interpretSuggestedOption(nextAction: string, option: string): GuidanceSuggestionAction {
  const value = normalizeText(option);
  const normalizedNextAction = normalizeText(nextAction);

  if (normalizedNextAction === "CONFIRM_DAYS") {
    const match = value.match(/(\d+)/);
    if (match) {
      return {
        kind: "SET_DAYS",
        value,
        days: Number(match[1]),
      };
    }
  }

  if (normalizedNextAction === "CONFIRM_START_DATE" && isIsoDate(value)) {
    return {
      kind: "SET_START_DATE",
      value,
      startDate: value,
    };
  }

  if (normalizedNextAction === "CONFIRM_DESTINATION" && value) {
    return {
      kind: "SET_DESTINATION",
      value,
    };
  }

  return {
    kind: "APPEND_NOTE",
    value,
  };
}
```

- [ ] **Step 4: Run the guidance tests to verify they pass**

Run: `cd apps/mobile-ios && npm run test -- src/screens/map/plan-entry-guidance.test.ts`

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit the tested guidance logic**

```bash
git add apps/mobile-ios/src/screens/map/plan-entry-guidance.ts apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts
git commit -m "feat: add tested plan entry guidance logic"
```

## Task 3: Wire The Guidance Logic Into `MapFlowScreen`

**Files:**
- Modify: `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
- Test: `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`

- [ ] **Step 1: Update the guidance tests to cover destination fallback behavior used by `MapFlowScreen`**

Append to `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`:

```ts
test("interpretSuggestedOption keeps destination text for destination confirmation", () => {
  const action = interpretSuggestedOption("CONFIRM_DESTINATION", "杭州");

  assert.deepEqual(action, {
    kind: "SET_DESTINATION",
    value: "杭州",
  });
});
```

- [ ] **Step 2: Run the tests to keep the red-green cycle honest**

Run: `cd apps/mobile-ios && npm run test -- src/screens/map/plan-entry-guidance.test.ts`

Expected: PASS, confirming the helper already covers the next case before UI wiring begins.

- [ ] **Step 3: Update `MapFlowScreen.tsx` to store missing fields and use the guidance helper**

Make these targeted changes:

1. Add the import:

```ts
import {
  buildPlanEntryGuidance,
  interpretSuggestedOption,
} from "./plan-entry-guidance";
```

2. Add missing-fields state near the other brief states:

```ts
const [briefMissingFields, setBriefMissingFields] = useState<string[]>([]);
```

3. Store missing fields from the brief response inside `handleSmartGenerate`:

```ts
setBriefMissingFields(Array.isArray(brief.missing_fields) ? brief.missing_fields.map((item) => String(item || "").trim()).filter(Boolean) : []);
```

4. Clear missing fields on success / preload:

```ts
setBriefMissingFields([]);
```

5. Add a memoized guidance model after `destinationNote`:

```ts
const entryGuidance = useMemo(
  () =>
    buildPlanEntryGuidance({
      missingFields: briefMissingFields,
      nextAction: briefNextAction,
      clarificationQuestion,
      suggestedOptions,
    }),
  [briefMissingFields, briefNextAction, clarificationQuestion, suggestedOptions],
);
```

6. Replace `handleApplySuggestedOption` with the parsed-action version:

```ts
function handleApplySuggestedOption(option: string) {
  const action = interpretSuggestedOption(briefNextAction, option);
  if (!action.value) return;

  switch (action.kind) {
    case "SET_DAYS":
      setDays(action.days);
      setEntryStatus(`已采用建议天数：${action.days} 天。`);
      return;
    case "SET_START_DATE":
      setStartDate(action.startDate);
      setShowDatePicker(true);
      setEntryStatus(`已采用建议日期：${action.startDate}。`);
      return;
    case "SET_DESTINATION":
      setDestination(action.value);
      setSelectedDestination(null);
      setEntryStatus(`已填入建议目的地：${action.value}，请再从搜索结果里确认标准城市。`);
      setFlowMode("search");
      return;
    case "APPEND_NOTE":
      if (!planningNote.includes(action.value)) {
        setPlanningNote((prev) => (prev.trim() ? `${prev.trim()}；${action.value}` : action.value));
      }
      setEntryStatus(`已记录补充偏好：${action.value}。`);
      return;
  }
}
```

7. Add a direct primary-action handler:

```ts
function handleGuidancePrimaryAction() {
  if (!entryGuidance.primaryAction) return;
  switch (entryGuidance.primaryAction.kind) {
    case "OPEN_DESTINATION_SEARCH":
      setFlowMode("search");
      return;
    case "OPEN_DATE_PICKER":
      setShowDatePicker(true);
      return;
  }
}
```

8. Pass the new props into `PlanEntryView`:

```tsx
guidance={entryGuidance}
onPressGuidancePrimaryAction={handleGuidancePrimaryAction}
```

- [ ] **Step 4: Run tests and typecheck after wiring the state logic**

Run: `cd apps/mobile-ios && npm run test -- src/screens/map/plan-entry-guidance.test.ts && npm run typecheck`

Expected: All guidance tests pass and TypeScript stays green.

- [ ] **Step 5: Commit the `MapFlowScreen` wiring**

```bash
git add apps/mobile-ios/src/screens/map/MapFlowScreen.tsx apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts
git commit -m "feat: connect plan entry guidance state"
```

## Task 4: Render The Guidance Card And Missing-Section Highlights In `PlanEntryView`

**Files:**
- Modify: `apps/mobile-ios/src/screens/map/PlanEntryView.tsx`
- Test: `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`

- [ ] **Step 1: Add one more failing unit test to lock down the “no missing fields” case**

Append to `apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts`:

```ts
test("buildPlanEntryGuidance hides completion UI when nothing is missing", () => {
  const guidance = buildPlanEntryGuidance({
    missingFields: [],
    nextAction: "GENERATE",
    clarificationQuestion: "",
    suggestedOptions: [],
  });

  assert.equal(guidance.needsCompletion, false);
  assert.equal(guidance.primaryAction, null);
});
```

- [ ] **Step 2: Run the tests to verify the new case passes before view work**

Run: `cd apps/mobile-ios && npm run test -- src/screens/map/plan-entry-guidance.test.ts`

Expected: PASS, confirming the helper contract is stable.

- [ ] **Step 3: Update `PlanEntryView.tsx` to render the guidance UI**

1. Add the import:

```ts
import type { PlanEntryGuidance } from "./plan-entry-guidance";
```

2. Extend props:

```ts
  guidance: PlanEntryGuidance;
  onPressGuidancePrimaryAction?: () => void;
```

3. Destructure the props:

```ts
  guidance,
  onPressGuidancePrimaryAction,
```

4. Render the guidance card above the destination card:

```tsx
      {guidance.needsCompletion ? (
        <View style={styles.guidanceCard}>
          <Text style={styles.guidanceEyebrow}>还差一点</Text>
          <Text style={styles.guidanceTitle}>{guidance.message || "AI 还需要你补一点关键信息。"}</Text>
          {guidance.primaryAction && onPressGuidancePrimaryAction ? (
            <Pressable style={styles.guidancePrimaryButton} onPress={onPressGuidancePrimaryAction}>
              <Text style={styles.guidancePrimaryButtonText}>{guidance.primaryAction.label}</Text>
            </Pressable>
          ) : null}
          {suggestedOptions.length > 0 && onApplySuggestedOption ? (
            <View style={styles.suggestionWrap}>
              {suggestedOptions.map((item) => (
                <Pressable key={item} style={styles.suggestionChip} onPress={() => onApplySuggestedOption(item)}>
                  <Text style={styles.suggestionChipText}>{item}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
```

5. Add highlight styles to the destination and schedule cards:

```tsx
      <View style={[styles.card, guidance.highlights.destination ? styles.cardHighlight : null]}>
```

```tsx
      <View style={[styles.card, guidance.highlights.schedule ? styles.cardHighlight : null]}>
```

6. Remove the old suggestion rendering from the bottom `statusCard`, keeping the status text and clarification text only.

7. Add these styles:

```ts
  guidanceCard: {
    borderRadius: 28,
    backgroundColor: "#fff7e8",
    borderWidth: 1,
    borderColor: "#ffd38a",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
  },
  guidanceEyebrow: {
    color: "#9b5a00",
    fontSize: 12,
    fontWeight: "800",
  },
  guidanceTitle: {
    color: "#2b1c00",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24,
  },
  guidancePrimaryButton: {
    borderRadius: 18,
    backgroundColor: "#0d1218",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: "flex-start",
  },
  guidancePrimaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  cardHighlight: {
    borderWidth: 1,
    borderColor: "#ffbf47",
    shadowColor: "#f0b64d",
  },
```

- [ ] **Step 4: Run the final frontend checks for this feature**

Run: `cd apps/mobile-ios && npm run test && npm run typecheck`

Expected: All unit tests pass and the mobile app still typechecks cleanly.

- [ ] **Step 5: Run the repo-level fast verification and commit the feature**

Run: `bash scripts/dev.sh verify-fast`

Expected: Go backend tests pass and iOS typecheck passes from the repo root.

Commit:

```bash
git add apps/mobile-ios/src/screens/map/PlanEntryView.tsx apps/mobile-ios/package.json apps/mobile-ios/tsconfig.json apps/mobile-ios/tsconfig.test.json apps/mobile-ios/src/screens/map/plan-entry-guidance.ts apps/mobile-ios/src/screens/map/plan-entry-guidance.test.ts
git commit -m "feat: add guided completion to plan entry"
```

## Self-Review

1. **Spec coverage:** Task 1 adds the lightweight test entrypoint required by the spec. Task 2 extracts and tests the pure guidance logic. Task 3 wires the new logic into `MapFlowScreen`. Task 4 renders the guidance card and highlights in `PlanEntryView`, then runs feature and repo-level verification.
2. **Placeholder scan:** No placeholders remain; every task has concrete files, commands, and code snippets.
3. **Type consistency:** The same names are used throughout: `buildPlanEntryGuidance`, `interpretSuggestedOption`, `PlanEntryGuidance`, `guidance`, and `onPressGuidancePrimaryAction`.
