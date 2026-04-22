# Result Explainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated explainability card to the result page that clearly shows itinerary confidence, validation state, downgrade reason, and coverage metrics.

**Architecture:** Keep all backend contracts and itinerary parsing unchanged, but extract a pure helper that maps `ItineraryView` into a compact explainability model. `MapResultView` then renders that model in a single new summary card, while the helper remains covered by fast unit tests.

**Tech Stack:** React Native + Expo, TypeScript, `node:test`, existing lightweight mobile test script, existing repo `verify-fast`

---

## File Map

- `apps/mobile-ios/src/screens/map/result-explainability.ts`
  Pure view-model helper for confidence, validation badges, downgrade text, and coverage rows.
- `apps/mobile-ios/src/screens/map/result-explainability.test.ts`
  Unit tests for explainability formatting.
- `apps/mobile-ios/src/screens/map/MapResultView.tsx`
  Render the new explainability card using the helper output.

## Task 1: Add And Test The Pure Result Explainability Helper

**Files:**
- Create: `apps/mobile-ios/src/screens/map/result-explainability.ts`
- Create: `apps/mobile-ios/src/screens/map/result-explainability.test.ts`
- Test: `apps/mobile-ios/src/screens/map/result-explainability.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `apps/mobile-ios/src/screens/map/result-explainability.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildResultExplainability } from "./result-explainability";

test("buildResultExplainability returns pass status for validated itineraries", () => {
  const model = buildResultExplainability({
    confidence: 0.74,
    sourceMode: "provider",
    degraded: false,
    degradedReason: "",
    warnings: [],
    validationResult: {
      passed: true,
      confidenceTier: "medium",
      issues: [],
      coverage: {
        providerGroundedBlocks: 6,
        routeEvidenceCoverage: 0.8,
        weatherEvidenceCoverage: 0.5,
        mustGoHitRate: 1,
      },
    },
  } as any);

  assert.equal(model.validation.label, "校验通过");
  assert.equal(model.confidenceText, "74%");
  assert.equal(model.degradedMessage, "");
});

test("buildResultExplainability returns downgrade message when itinerary is degraded", () => {
  const model = buildResultExplainability({
    confidence: 0.52,
    sourceMode: "fallback",
    degraded: true,
    degradedReason: "provider_coverage_low",
    warnings: [],
    validationResult: null,
  } as any);

  assert.equal(model.validation.label, "待校验");
  assert.equal(model.degradedMessage, "真实地图数据覆盖不足，当前仍是内置事实草案。");
});

test("buildResultExplainability surfaces first validation issue when validation failed", () => {
  const model = buildResultExplainability({
    confidence: 0.41,
    sourceMode: "provider",
    degraded: true,
    degradedReason: "validation_not_passed",
    warnings: [],
    validationResult: {
      passed: false,
      confidenceTier: "low",
      issues: [{ code: "ROUTE_LOW", message: "路线证据不足" }],
      coverage: {
        providerGroundedBlocks: 2,
        routeEvidenceCoverage: 0.25,
        weatherEvidenceCoverage: 0.1,
        mustGoHitRate: 0,
      },
    },
  } as any);

  assert.equal(model.validation.label, "校验未通过");
  assert.equal(model.issuePreview[0], "路线证据不足");
});
```

- [ ] **Step 2: Run the tests to verify they fail because the helper does not exist yet**

Run: `cd apps/mobile-ios && npm run test`

Expected: FAIL with `Cannot find module './result-explainability'`.

- [ ] **Step 3: Implement the minimal helper**

Create `apps/mobile-ios/src/screens/map/result-explainability.ts` with:

```ts
import type { ItineraryView } from "../../types/itinerary";

type ExplainabilityTone = "success" | "warn" | "neutral";

export type ResultExplainability = {
  confidenceText: string;
  sourceModeText: string;
  validation: {
    label: string;
    tone: ExplainabilityTone;
    detail: string;
  };
  degradedMessage: string;
  coverageItems: Array<{ label: string; value: string }>;
  issuePreview: string[];
};

function percentText(value: number): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function sourceModeText(value: string): string {
  switch (value) {
    case "provider":
      return "真实地图数据";
    case "fallback":
      return "内置事实草案";
    default:
      return "未标记来源";
  }
}

function degradedReasonText(value: string): string {
  switch (value) {
    case "provider_coverage_low":
      return "真实地图数据覆盖不足，当前仍是内置事实草案。";
    case "validation_not_passed":
      return "当前结果还没有通过最终校验。";
    case "destination_custom_unresolved":
      return "目的地还没有完成标准化确认。";
    default:
      return value ? `降级原因：${value}` : "";
  }
}

export function buildResultExplainability(itineraryView: ItineraryView | null): ResultExplainability {
  const validation = itineraryView?.validationResult || null;
  return {
    confidenceText: percentText(itineraryView?.confidence || 0),
    sourceModeText: sourceModeText(itineraryView?.sourceMode || ""),
    validation: validation
      ? validation.passed
        ? { label: "校验通过", tone: "success", detail: `可信度层级 ${validation.confidenceTier || "unknown"}` }
        : { label: "校验未通过", tone: "warn", detail: `可信度层级 ${validation.confidenceTier || "unknown"}` }
      : { label: "待校验", tone: "neutral", detail: "保存前会自动校验" },
    degradedMessage: itineraryView?.degraded ? degradedReasonText(itineraryView.degradedReason) : "",
    coverageItems: validation
      ? [
          { label: "真实块数", value: String(validation.coverage.providerGroundedBlocks) },
          { label: "路线证据", value: percentText(validation.coverage.routeEvidenceCoverage) },
          { label: "天气证据", value: percentText(validation.coverage.weatherEvidenceCoverage) },
          { label: "必去命中", value: percentText(validation.coverage.mustGoHitRate) },
        ]
      : [],
    issuePreview: validation ? validation.issues.map((item) => item.message).filter(Boolean).slice(0, 2) : [],
  };
}
```

- [ ] **Step 4: Run the tests to verify the helper passes**

Run: `cd apps/mobile-ios && npm run test`

Expected: PASS with the new result explainability tests and the existing plan-entry tests.

## Task 2: Render The Explainability Card In `MapResultView`

**Files:**
- Modify: `apps/mobile-ios/src/screens/map/MapResultView.tsx`
- Test: `apps/mobile-ios/src/screens/map/result-explainability.test.ts`

- [ ] **Step 1: Add a helper import and memoized explainability model**

Add:

```ts
import { buildResultExplainability } from "./result-explainability";
```

Then near the existing `itineraryView` memo:

```ts
const explainability = useMemo(() => buildResultExplainability(itineraryView), [itineraryView]);
```

- [ ] **Step 2: Render the new explainability card between the summary card and warning card**

Add:

```tsx
          <View style={styles.explainCard}>
            <View style={styles.explainHeader}>
              <Text style={styles.explainTitle}>可信度与校验</Text>
              <View
                style={[
                  styles.explainBadge,
                  explainability.validation.tone === "success"
                    ? styles.explainBadgeSuccess
                    : explainability.validation.tone === "warn"
                      ? styles.explainBadgeWarn
                      : styles.explainBadgeNeutral,
                ]}
              >
                <Text style={styles.explainBadgeText}>{explainability.validation.label}</Text>
              </View>
            </View>
            <Text style={styles.explainConfidence}>可信度 {explainability.confidenceText}</Text>
            <Text style={styles.explainDetail}>{explainability.validation.detail}</Text>
            <Text style={styles.explainDetail}>数据来源：{explainability.sourceModeText}</Text>
            {explainability.degradedMessage ? (
              <Text style={styles.explainDegraded}>{explainability.degradedMessage}</Text>
            ) : null}
            {explainability.coverageItems.length ? (
              <View style={styles.explainMetricWrap}>
                {explainability.coverageItems.map((item) => (
                  <View key={item.label} style={styles.explainMetricChip}>
                    <Text style={styles.explainMetricLabel}>{item.label}</Text>
                    <Text style={styles.explainMetricValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {explainability.issuePreview.map((item) => (
              <Text key={item} style={styles.explainIssue}>
                {item}
              </Text>
            ))}
          </View>
```

- [ ] **Step 3: Add the required styles**

Add these style keys:

```ts
  explainCard: {
    borderRadius: 22,
    backgroundColor: "#fffdf7",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#efe3b2",
    gap: 8,
  },
  explainHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  explainTitle: {
    color: "#14202c",
    fontSize: 16,
    fontWeight: "800",
  },
  explainBadge: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  explainBadgeSuccess: {
    backgroundColor: "#ddf7ea",
  },
  explainBadgeWarn: {
    backgroundColor: "#ffe7da",
  },
  explainBadgeNeutral: {
    backgroundColor: "#edf3fa",
  },
  explainBadgeText: {
    color: "#203246",
    fontSize: 12,
    fontWeight: "800",
  },
  explainConfidence: {
    color: "#0a1320",
    fontSize: 24,
    fontWeight: "800",
  },
  explainDetail: {
    color: "#5b6d7f",
    fontSize: 13,
    lineHeight: 20,
  },
  explainDegraded: {
    color: "#9a4d14",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  explainMetricWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  explainMetricChip: {
    borderRadius: 16,
    backgroundColor: "#f6f8fb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 92,
  },
  explainMetricLabel: {
    color: "#6c7f91",
    fontSize: 12,
    fontWeight: "700",
  },
  explainMetricValue: {
    marginTop: 4,
    color: "#112133",
    fontSize: 14,
    fontWeight: "800",
  },
  explainIssue: {
    color: "#7f4820",
    fontSize: 13,
    lineHeight: 20,
  },
```

- [ ] **Step 4: Run frontend and repo-level verification**

Run:

```bash
cd apps/mobile-ios && npm run test
cd apps/mobile-ios && npm run typecheck
bash scripts/dev.sh verify-fast
```

Expected: All tests pass and repo-level fast verification stays green.

- [ ] **Step 5: Commit the result explainability feature**

```bash
git add apps/mobile-ios/src/screens/map/result-explainability.ts apps/mobile-ios/src/screens/map/result-explainability.test.ts apps/mobile-ios/src/screens/map/MapResultView.tsx docs/superpowers/specs/2026-04-22-result-explainability-design.md docs/superpowers/plans/2026-04-22-result-explainability.md
git commit -m "feat: explain itinerary confidence on result page"
```
