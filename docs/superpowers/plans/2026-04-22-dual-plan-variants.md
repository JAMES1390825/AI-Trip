# Dual Plan Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate two itinerary variants from `generate-v2` and let users switch between them in the result page.

**Architecture:** Add a pure parsing helper for `plans[]`, keep `MapFlowScreen` responsible for generation-time state, and let `MapResultView` manage only the active variant tab and the currently displayed itinerary.

**Tech Stack:** React Native + Expo, TypeScript, `node:test`, existing mobile test runner, repo `verify-fast`

---

## File Map

- `apps/mobile-ios/src/screens/map/result-variants.ts`
  Pure helper for parsing backend `plans[]` into UI-ready variant objects.
- `apps/mobile-ios/src/screens/map/result-variants.test.ts`
  Unit tests for variant parsing and fallback behavior.
- `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
  Request `variants=2`, store parsed variants, and pass them into the result page.
- `apps/mobile-ios/src/screens/map/MapResultView.tsx`
  Render variant chips and switch the displayed itinerary.

## Task 1: Add And Test Variant Parsing

**Files:**
- Create: `apps/mobile-ios/src/screens/map/result-variants.ts`
- Create: `apps/mobile-ios/src/screens/map/result-variants.test.ts`
- Test: `apps/mobile-ios/src/screens/map/result-variants.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mobile-ios/src/screens/map/result-variants.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { extractPlanVariants } from "./result-variants";

test("extractPlanVariants returns two labeled variants from plans array", () => {
  const variants = extractPlanVariants({
    plans: [
      { plan_variant: "balanced", itinerary: { destination: "上海", days: [] } },
      { plan_variant: "experience", itinerary: { destination: "上海", days: [] } },
    ],
  });

  assert.equal(variants.length, 2);
  assert.equal(variants[0].key, "balanced");
  assert.equal(variants[1].label, "体验版");
});

test("extractPlanVariants falls back to a single default variant when plans is missing", () => {
  const variants = extractPlanVariants({ destination: "上海", days: [] });

  assert.equal(variants.length, 1);
  assert.equal(variants[0].key, "default");
});
```

- [ ] **Step 2: Run tests to confirm the helper is missing**

Run: `cd apps/mobile-ios && npm run test`

Expected: FAIL with `Cannot find module './result-variants'`.

- [ ] **Step 3: Implement the helper**

Create `apps/mobile-ios/src/screens/map/result-variants.ts`:

```ts
export type PlanVariantView = {
  key: string;
  label: string;
  itinerary: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function variantLabel(value: string): string {
  switch (String(value || "").trim()) {
    case "balanced":
      return "平衡版";
    case "experience":
      return "体验版";
    default:
      return "推荐方案";
  }
}

export function extractPlanVariants(payload: Record<string, unknown>): PlanVariantView[] {
  const plans = asArray(payload.plans)
    .map((item) => asRecord(item))
    .map((item) => {
      const key = String(item.plan_variant || "").trim() || "default";
      const itinerary = asRecord(item.itinerary);
      return Object.keys(itinerary).length ? { key, label: variantLabel(key), itinerary } : null;
    })
    .filter((item): item is PlanVariantView => Boolean(item));

  if (plans.length) return plans;
  return [{ key: "default", label: "推荐方案", itinerary: payload }];
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `cd apps/mobile-ios && npm run test`

Expected: PASS with the new variant tests.

## Task 2: Generate And Render Two Variants

**Files:**
- Modify: `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
- Modify: `apps/mobile-ios/src/screens/map/MapResultView.tsx`
- Test: `apps/mobile-ios/src/screens/map/result-variants.test.ts`

- [ ] **Step 1: Import and use the variant helper in `MapFlowScreen`**

Add:

```ts
import { extractPlanVariants, type PlanVariantView } from "./result-variants";
```

Add state:

```ts
const [generatedVariants, setGeneratedVariants] = useState<PlanVariantView[]>([]);
```

Update generation call:

```ts
const result = await api.generatePlanV2(brief, {
  variants: 2,
  allowFallback: true,
});
const variants = extractPlanVariants(result);
const primary = variants[0]?.itinerary || null;
```

Clear variants on preload/success reset as needed.

- [ ] **Step 2: Pass variants into `MapResultView`**

Extend the render call:

```tsx
      <MapResultView
        itinerary={generatedItinerary}
        variants={generatedVariants}
        onBack={() => setFlowMode("entry")}
        onPlanSaved={onPlanSaved}
      />
```

- [ ] **Step 3: Update `MapResultView` props and active variant state**

Add prop types:

```ts
import type { PlanVariantView } from "./result-variants";
```

```ts
  variants?: PlanVariantView[];
```

Add state:

```ts
const [activeVariantKey, setActiveVariantKey] = useState("");
```

Sync state from props:

```ts
useEffect(() => {
  const firstKey = variants?.[0]?.key || "";
  setActiveVariantKey(firstKey);
}, [variants]);
```

Compute current variant:

```ts
const activeVariant = useMemo(() => {
  if (!variants?.length) return null;
  return variants.find((item) => item.key === activeVariantKey) || variants[0];
}, [activeVariantKey, variants]);
```

Add effect to switch local itinerary when variant changes:

```ts
useEffect(() => {
  if (!activeVariant) return;
  setLocalItinerary(activeVariant.itinerary);
}, [activeVariant]);
```

- [ ] **Step 4: Render the variant chips near the existing mode chips**

Add:

```tsx
          {variants && variants.length > 1 ? (
            <View style={styles.variantRow}>
              {variants.map((item) => {
                const active = item.key === (activeVariant?.key || "");
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.variantChip, active ? styles.variantChipActive : null]}
                    onPress={() => setActiveVariantKey(item.key)}
                  >
                    <Text style={[styles.variantChipText, active ? styles.variantChipTextActive : null]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
```

Add styles:

```ts
  variantRow: {
    flexDirection: "row",
    gap: 8,
  },
  variantChip: {
    borderRadius: 16,
    backgroundColor: "#eef4fa",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  variantChipActive: {
    backgroundColor: "#173051",
  },
  variantChipText: {
    color: "#5b7186",
    fontSize: 13,
    fontWeight: "800",
  },
  variantChipTextActive: {
    color: "#ffffff",
  },
```

- [ ] **Step 5: Run verification and commit**

Run:

```bash
cd apps/mobile-ios && npm run test
cd apps/mobile-ios && npm run typecheck
bash scripts/dev.sh verify-fast
```

Commit:

```bash
git add apps/mobile-ios/src/screens/map/result-variants.ts apps/mobile-ios/src/screens/map/result-variants.test.ts apps/mobile-ios/src/screens/map/MapFlowScreen.tsx apps/mobile-ios/src/screens/map/MapResultView.tsx docs/superpowers/specs/2026-04-22-dual-plan-variants-design.md docs/superpowers/plans/2026-04-22-dual-plan-variants.md
git commit -m "feat: support dual generated trip variants"
```
