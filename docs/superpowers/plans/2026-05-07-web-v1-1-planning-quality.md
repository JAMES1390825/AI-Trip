# Web V1.1 Planning Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Web V1.1 planning-quality package so users can enter real trip constraints and see why a generated route matches them.

**Architecture:** Keep the current Next.js full-stack app. Add request fields at the API boundary, thread them through intent/blueprint/planning, and isolate deterministic route-quality scoring in a focused domain module. Render the new planning constraints and quality summary with mobile-friendly CSS.

**Tech Stack:** Next.js App Router, React client components, TypeScript domain modules, Node test runner, SQLite-backed route card store.

---

## File Structure

- Modify `apps/web/src/domain/types.ts`: add `BudgetRange`, extend `RouteCardRequest`, and add `RouteQualitySummary` to `RouteCard`.
- Modify `apps/web/app/api/route-cards/generate/route.ts`: validate and cap `budgetRange`, `mustVisitText`, and `avoidText`.
- Modify `apps/web/app/api/route-cards/generate/route.test.ts`: cover new request fields and caps.
- Modify `apps/web/src/domain/user-intent.ts`: infer budget, must-have, and avoid constraints from richer inputs.
- Modify `apps/web/src/domain/user-intent.test.ts`: verify richer intent inference.
- Modify `apps/web/src/domain/route-blueprint.ts`: include must-go and avoid hints in search/planning constraints.
- Modify `apps/web/src/domain/route-blueprint.test.ts`: verify must-go queries and avoid constraints.
- Create `apps/web/src/domain/route-quality.ts`: derive match score, satisfied constraints, tradeoffs, confirmation needs, and provider health.
- Create `apps/web/src/domain/route-quality.test.ts`: verify deterministic quality summary behavior.
- Modify `apps/web/src/domain/real-route-planner.ts`: attach `qualitySummary` to AI/Amap, Amap-only, and fallback cards.
- Modify `apps/web/src/domain/real-route-planner.test.ts`: verify generated cards include quality summaries.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: expose lightweight planning constraint inputs and include them in generation requests.
- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: verify the planner renders the constraint inputs.
- Modify `apps/web/src/components/RouteCard.tsx`: render the route quality summary near the trust summary.
- Modify `apps/web/src/components/RouteCard.test.ts`: verify quality summary rendering.
- Modify `apps/web/app/globals.css`: style constraint inputs, quality panels, provider chips, and mobile layout.

## Tasks

### Task 1: Request Contract And Planner Inputs

**Files:**
- Modify: `apps/web/src/domain/types.ts`
- Modify: `apps/web/app/api/route-cards/generate/route.ts`
- Modify: `apps/web/app/api/route-cards/generate/route.test.ts`
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing API tests**

Add tests proving the generate endpoint parser accepts and caps richer planning fields:

```ts
test("asRequestBody preserves richer planning constraint fields", () => {
  const body = asRequestBody({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-06-01",
    durationDays: 2,
    budgetRange: "budget_friendly",
    companion: "family",
    transportPreference: "public_transit_ok",
    startPoint: "武林广场",
    endPoint: "杭州东站",
    mustVisitText: "西湖、法喜寺",
    avoidText: "不要太赶，少排队",
  });

  assert.equal(body?.budgetRange, "budget_friendly");
  assert.equal(body?.companion, "family");
  assert.equal(body?.transportPreference, "public_transit_ok");
  assert.equal(body?.startPoint, "武林广场");
  assert.equal(body?.endPoint, "杭州东站");
  assert.equal(body?.mustVisitText, "西湖、法喜寺");
  assert.equal(body?.avoidText, "不要太赶，少排队");
});

test("asRequestBody caps richer planning text fields", () => {
  const longText = "西湖".repeat(200);
  const body = asRequestBody({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-06-01",
    durationDays: 1,
    mustVisitText: longText,
    avoidText: longText,
  });

  assert.equal(body?.mustVisitText?.length, 240);
  assert.equal(body?.avoidText?.length, 240);
});
```

Run: `npm test -- apps/web/app/api/route-cards/generate/route.test.ts`

Expected: FAIL because `budgetRange`, `mustVisitText`, and `avoidText` are not parsed yet.

- [ ] **Step 2: Extend request types and API parsing**

Add these types and fields:

```ts
export type BudgetRange = "budget_friendly" | "balanced" | "flexible";

export type RouteCardRequest = {
  // existing fields stay unchanged
  budgetRange?: BudgetRange;
  mustVisitText?: string;
  avoidText?: string;
};
```

In `route.ts`, add:

```ts
const allowedBudgetRanges = new Set(["budget_friendly", "balanced", "flexible"]);
const maxConstraintTextLength = 240;

const asBudgetRange = (value: unknown): RouteCardRequest["budgetRange"] => {
  return typeof value === "string" && allowedBudgetRanges.has(value)
    ? (value as RouteCardRequest["budgetRange"])
    : undefined;
};

const capConstraintText = (value: unknown) => capText(value, maxConstraintTextLength);
```

Thread the parsed values into the returned request body:

```ts
budgetRange: asBudgetRange(input.budgetRange),
mustVisitText: capConstraintText(input.mustVisitText),
avoidText: capConstraintText(input.avoidText),
```

Run: `npm test -- apps/web/app/api/route-cards/generate/route.test.ts`

Expected: PASS.

- [ ] **Step 3: Write failing planner UI test**

Add assertions to `apps/web/src/components/RoutePlannerApp.test.ts`:

```ts
assert.match(html, /预算范围/);
assert.match(html, /同行人/);
assert.match(html, /交通偏好/);
assert.match(html, /起点区域/);
assert.match(html, /结束区域/);
assert.match(html, /必去地点/);
assert.match(html, /不想去|避开/);
```

Run: `npm test -- apps/web/src/components/RoutePlannerApp.test.ts`

Expected: FAIL because the fields are not rendered yet.

- [ ] **Step 4: Add lightweight planner constraint inputs**

In `RoutePlannerApp.tsx`, add local state:

```ts
const [budgetRange, setBudgetRange] = useState<BudgetRange>("balanced");
const [companion, setCompanion] = useState<CompanionType>("friends");
const [transportPreference, setTransportPreference] =
  useState<TransportPreference>("walk_first");
const [startPoint, setStartPoint] = useState("");
const [endPoint, setEndPoint] = useState("");
const [mustVisitText, setMustVisitText] = useState("");
const [avoidText, setAvoidText] = useState("少走路，不要太赶");
```

Add a compact constraints section with select/input/textarea controls labeled exactly:

```tsx
<section className="planning-constraints-panel" aria-labelledby="planning-constraints-title">
  <p className="eyebrow">Planning Details</p>
  <h2 id="planning-constraints-title">补充真实旅行约束</h2>
  <p className="constraint-copy">不用填满，写几个关键点就能让路线更像真实计划。</p>
  {/* budget, companion, transport, start/end, must-go, avoid controls */}
</section>
```

Include the new values in the generate request body:

```ts
budgetRange,
companion,
transportPreference,
startPoint,
endPoint,
mustVisitText,
avoidText,
```

Run: `npm test -- apps/web/src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 5: Add CSS for constraint inputs**

Add mobile-safe classes to `globals.css`:

```css
.planning-constraints-panel {
  border: 1px solid rgba(15, 35, 20, 0.14);
  border-radius: 28px;
  padding: 28px;
  background: linear-gradient(135deg, rgba(255, 249, 225, 0.94), rgba(236, 252, 240, 0.88));
}

.constraint-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 720px) {
  .constraint-grid {
    grid-template-columns: 1fr;
  }
}
```

Run: `npm test -- apps/web/src/components/RoutePlannerApp.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/domain/types.ts apps/web/app/api/route-cards/generate/route.ts apps/web/app/api/route-cards/generate/route.test.ts apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: collect richer trip constraints"
```

### Task 2: Intent And Blueprint Constraints

**Files:**
- Modify: `apps/web/src/domain/user-intent.ts`
- Modify: `apps/web/src/domain/user-intent.test.ts`
- Modify: `apps/web/src/domain/route-blueprint.ts`
- Modify: `apps/web/src/domain/route-blueprint.test.ts`

- [ ] **Step 1: Write failing intent tests**

Add:

```ts
test("inferUserIntent includes explicit budget and constraint text", () => {
  const intent = inferUserIntent({
    themeId: "classic",
    note: "想拍照",
    tripPreferences: ["自然风光"],
    budgetRange: "budget_friendly",
    mustVisitText: "西湖、法喜寺",
    avoidText: "不要太赶，少排队",
    companion: "family",
    transportPreference: "public_transit_ok",
  });

  assert.equal(intent.budgetPosture, "low");
  assert.ok(intent.mustHaveConstraints.some((item) => item.includes("西湖")));
  assert.ok(intent.mustHaveConstraints.some((item) => item.includes("法喜寺")));
  assert.ok(intent.avoidConstraints.some((item) => item.includes("不要太赶")));
  assert.ok(intent.avoidConstraints.some((item) => item.includes("少排队")));
  assert.ok(intent.mustHaveConstraints.some((item) => item.includes("亲子")));
  assert.ok(intent.mustHaveConstraints.some((item) => item.includes("公共交通")));
});
```

Run: `npm test -- apps/web/src/domain/user-intent.test.ts`

Expected: FAIL because explicit fields are not part of intent input yet.

- [ ] **Step 2: Implement richer intent inference**

Extend `IntentInput` with:

```ts
budgetRange?: RouteCardRequest["budgetRange"];
mustVisitText?: string;
avoidText?: string;
```

Split short Chinese notes by punctuation:

```ts
const splitConstraintText = (value?: string) =>
  (value ?? "")
    .split(/[，,、\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
```

Add `mustVisitText` parts to `mustHaveConstraints`, `avoidText` parts to `avoidConstraints`, map `budget_friendly` to `low`, and add companion/transport labels such as `亲子友好节奏` and `公共交通可达`.

Run: `npm test -- apps/web/src/domain/user-intent.test.ts`

Expected: PASS.

- [ ] **Step 3: Write failing blueprint tests**

Add:

```ts
test("buildRouteBlueprint includes must visit text as search queries", () => {
  const blueprint = buildRouteBlueprint({
    city: "杭州",
    themeId: "classic",
    durationDays: 1,
    mustVisitText: "西湖、法喜寺",
    avoidText: "不要太赶，少排队",
  });

  assert.ok(blueprint.searchQueries.some((query) => query.includes("西湖")));
  assert.ok(blueprint.searchQueries.some((query) => query.includes("法喜寺")));
  assert.ok(blueprint.constraints.some((constraint) => constraint.includes("不要太赶")));
  assert.ok(blueprint.constraints.some((constraint) => constraint.includes("少排队")));
});
```

Run: `npm test -- apps/web/src/domain/route-blueprint.test.ts`

Expected: FAIL because the blueprint ignores these fields.

- [ ] **Step 4: Implement blueprint threading**

Extend `BlueprintInput` to pick:

```ts
"budgetRange" | "mustVisitText" | "avoidText"
```

Add text keywords from `mustVisitText` to `searchQueries`, and add split `avoidText` constraints to `constraints`.

Run: `npm test -- apps/web/src/domain/route-blueprint.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/domain/user-intent.ts apps/web/src/domain/user-intent.test.ts apps/web/src/domain/route-blueprint.ts apps/web/src/domain/route-blueprint.test.ts
git commit -m "feat: infer planning constraints from trip details"
```

### Task 3: Route Quality Summary

**Files:**
- Create: `apps/web/src/domain/route-quality.ts`
- Create: `apps/web/src/domain/route-quality.test.ts`
- Modify: `apps/web/src/domain/types.ts`
- Modify: `apps/web/src/domain/real-route-planner.ts`
- Modify: `apps/web/src/domain/real-route-planner.test.ts`

- [ ] **Step 1: Write failing route quality tests**

Create `route-quality.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteQualitySummary } from "./route-quality";

test("buildRouteQualitySummary explains satisfied constraints and provider health", () => {
  const summary = buildRouteQualitySummary({
    request: {
      city: "杭州",
      themeId: "classic",
      startDate: "2026-06-01",
      durationDays: 1,
      budgetRange: "budget_friendly",
      mustVisitText: "西湖、法喜寺",
      avoidText: "不要太赶",
      companion: "family",
      transportPreference: "public_transit_ok",
    },
    planningMode: "ai_amap",
    sourceLabel: "高德真实地点 + AI 编排",
    evidenceSources: [{ title: "杭州攻略", url: "https://example.com", snippet: "西湖" }],
    providerWarnings: [],
    degradedLegCount: 0,
  });

  assert.ok(summary.matchScore >= 80);
  assert.ok(summary.satisfied.some((item) => item.includes("预算")));
  assert.ok(summary.satisfied.some((item) => item.includes("西湖")));
  assert.ok(summary.satisfied.some((item) => item.includes("亲子")));
  assert.ok(summary.providerHealth.some((item) => item.includes("高德")));
  assert.ok(summary.providerHealth.some((item) => item.includes("Exa")));
});

test("buildRouteQualitySummary lowers confidence for degraded fallback", () => {
  const summary = buildRouteQualitySummary({
    request: {
      city: "杭州",
      themeId: "classic",
      startDate: "2026-06-01",
      durationDays: 1,
      mustVisitText: "西湖",
    },
    planningMode: "fallback",
    sourceLabel: "本地 fallback",
    evidenceSources: [],
    providerWarnings: ["高德暂时不可用"],
    degradedLegCount: 2,
  });

  assert.ok(summary.matchScore < 80);
  assert.ok(summary.confirmationNeeded.some((item) => item.includes("高德暂时不可用")));
  assert.ok(summary.providerHealth.some((item) => item.includes("本地兜底")));
});
```

Run: `npm test -- apps/web/src/domain/route-quality.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Add route quality types and implementation**

Add to `types.ts`:

```ts
export type RouteQualitySummary = {
  matchScore: number;
  satisfied: string[];
  tradeoffs: string[];
  confirmationNeeded: string[];
  providerHealth: string[];
};
```

Add `qualitySummary?: RouteQualitySummary` to `RouteCard`.

Implement `buildRouteQualitySummary` with deterministic scoring:

```ts
const score = clamp(
  72 + (planningMode === "ai_amap" ? 10 : 0) + (evidenceSources.length > 0 ? 6 : 0) -
    degradedLegCount * 8 -
    providerWarnings.length * 4,
  45,
  96,
);
```

Return concise Chinese arrays for satisfied constraints, tradeoffs, confirmation needs, and provider health.

Run: `npm test -- apps/web/src/domain/route-quality.test.ts`

Expected: PASS.

- [ ] **Step 3: Write failing planner integration test**

Add to `real-route-planner.test.ts`:

```ts
test("generateRealRouteCard attaches route quality summary", async () => {
  const card = await generateRealRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-06-01",
    durationDays: 1,
    budgetRange: "budget_friendly",
    mustVisitText: "西湖",
    avoidText: "不要太赶",
  });

  assert.ok(card.qualitySummary);
  assert.ok(card.qualitySummary.matchScore > 0);
  assert.ok(card.qualitySummary.satisfied.length > 0);
});
```

Run: `npm test -- apps/web/src/domain/real-route-planner.test.ts`

Expected: FAIL because cards do not attach `qualitySummary`.

- [ ] **Step 4: Attach quality summaries in real planner**

Import `buildRouteQualitySummary` in `real-route-planner.ts` and set:

```ts
qualitySummary: buildRouteQualitySummary({
  request,
  planningMode: card.planningMode,
  sourceLabel: card.sourceLabel,
  evidenceSources,
  providerWarnings,
  degradedLegCount: legs.filter((leg) => leg.transportMode === "unknown").length,
}),
```

Apply the same pattern to fallback card creation using `planningMode: "fallback"`, empty evidence, and existing provider warnings.

Run: `npm test -- apps/web/src/domain/real-route-planner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/domain/types.ts apps/web/src/domain/route-quality.ts apps/web/src/domain/route-quality.test.ts apps/web/src/domain/real-route-planner.ts apps/web/src/domain/real-route-planner.test.ts
git commit -m "feat: explain route planning quality"
```

### Task 4: Route Quality UI And Mobile Polish

**Files:**
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing RouteCard rendering test**

Add a `qualitySummary` to the RouteCard test fixture and assert:

```ts
assert.match(html, /匹配度/);
assert.match(html, /已满足/);
assert.match(html, /取舍/);
assert.match(html, /需要确认/);
assert.match(html, /高德地点/);
```

Run: `npm test -- apps/web/src/components/RouteCard.test.ts`

Expected: FAIL because the quality summary is not rendered.

- [ ] **Step 2: Render quality summary near trust summary**

In `RouteCard.tsx`, render:

```tsx
{routeCard.qualitySummary ? (
  <section className="route-quality-panel" aria-label="路线质量说明">
    <div className="quality-score">
      <span>匹配度</span>
      <strong>{routeCard.qualitySummary.matchScore}</strong>
    </div>
    {/* 已满足 / 取舍 / 需要确认 / provider health */}
  </section>
) : null}
```

Keep every list optional so old saved route cards still render.

Run: `npm test -- apps/web/src/components/RouteCard.test.ts`

Expected: PASS.

- [ ] **Step 3: Add quality and mobile CSS**

Add:

```css
.route-quality-panel {
  display: grid;
  gap: 18px;
  border: 1px solid rgba(15, 35, 20, 0.12);
  border-radius: 28px;
  padding: 22px;
  background: rgba(255, 255, 246, 0.86);
}

.quality-score strong {
  font-size: clamp(2.4rem, 8vw, 4.4rem);
  line-height: 0.95;
}

.provider-health-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 720px) {
  .planner-shell,
  .route-card {
    gap: 18px;
  }

  .route-quality-panel {
    border-radius: 22px;
    padding: 18px;
  }
}
```

Run: `npm test -- apps/web/src/components/RouteCard.test.ts`

Expected: PASS.

- [ ] **Step 4: Full verification**

Run:

```bash
npm run verify
```

Expected: typecheck, tests, and production build all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/RouteCard.tsx apps/web/src/components/RouteCard.test.ts apps/web/app/globals.css
git commit -m "feat: surface route quality in planning result"
```

## Self-Review

- Spec coverage: all acceptance criteria map to Tasks 1-4.
- Placeholder scan: no task uses TBD, TODO, or unspecified implementation.
- Type consistency: `budgetRange`, `mustVisitText`, `avoidText`, and `qualitySummary` are consistently named across request, domain, planner, and UI.
