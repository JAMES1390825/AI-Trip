# Pretrip Checklist v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a route-specific pretrip checklist to generated, revised, saved, and shared route cards.

**Architecture:** Implement checklist generation as a deterministic domain helper that reads existing route-card facts. Attach checklist data inside route-card generation, then render it through the existing `RouteCard` component so both the main preview and share page inherit it automatically.

**Tech Stack:** Next.js app router, React server rendering tests, Node `node:test`, TypeScript domain modules.

---

## File Structure

- Create `apps/web/src/domain/pretrip-checklist.ts`: deterministic checklist rules and deduplication.
- Create `apps/web/src/domain/pretrip-checklist.test.ts`: unit tests for checklist categories and caps.
- Modify `apps/web/src/domain/types.ts`: add checklist category, severity, item types, and optional `pretripChecklist` on `RouteCard`.
- Modify `apps/web/src/domain/planner.ts`: attach checklist to fallback route cards.
- Modify `apps/web/src/domain/planner.test.ts`: assert generated fallback cards include checklist data.
- Modify `apps/web/src/domain/real-route-planner.ts`: attach checklist to provider route cards and fallback override route cards.
- Modify `apps/web/src/domain/real-route-planner.test.ts`: assert real planner outputs include checklist data.
- Modify `apps/web/src/components/RouteCard.tsx`: render the checklist panel inside the route card.
- Modify `apps/web/src/components/RouteCard.test.ts`: assert checklist UI renders.
- Modify `apps/web/app/globals.css`: add checklist styles.
- Modify `docs/product/citywalk-route-cards-prd.md`: add checklist to MVP scope.
- Modify `docs/product/citywalk-route-cards-architecture.md`: document checklist as a trust layer.

---

### Task 1: Checklist Domain Helper

**Files:**
- Create: `apps/web/src/domain/pretrip-checklist.test.ts`
- Create: `apps/web/src/domain/pretrip-checklist.ts`
- Modify: `apps/web/src/domain/types.ts`

- [ ] **Step 1: Write failing checklist tests**

Create `apps/web/src/domain/pretrip-checklist.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "./planner";
import { buildPretripChecklist } from "./pretrip-checklist";
import type { RouteCard } from "./types";

test("buildPretripChecklist creates weather time traffic budget and comfort items from route facts", () => {
  const card: RouteCard = {
    ...generateRouteCard({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: "想拍照"
    }),
    estimatedCostCny: 520,
    weatherAlternative: "下雨改去室内展馆。",
    stops: [
      {
        id: "1-a",
        time: "10:00",
        poiId: "a",
        poi: "湖滨步行街",
        tags: ["photo", "walkable"],
        lat: 30,
        lng: 120,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合拍照。",
        risk: "营业时间参考 09:00-17:00，出发前建议再确认。",
        sourceMode: "provider"
      },
      {
        id: "2-b",
        time: "12:20",
        poiId: "b",
        poi: "城市阳台",
        tags: ["landmark"],
        lat: 30.01,
        lng: 120.01,
        mapUrl: "https://uri.amap.com/marker",
        reason: "视野开阔。",
        risk: "出发前建议确认天气和现场开放状态。",
        sourceMode: "provider"
      },
      {
        id: "3-c",
        time: "15:00",
        poiId: "c",
        poi: "南宋御街",
        tags: ["local_food"],
        lat: 30.02,
        lng: 120.02,
        mapUrl: "https://uri.amap.com/marker",
        reason: "适合吃饭。",
        risk: "风险较低。",
        sourceMode: "provider"
      },
      {
        id: "4-d",
        time: "19:30",
        poiId: "d",
        poi: "夜景平台",
        tags: ["night"],
        lat: 30.03,
        lng: 120.03,
        mapUrl: "https://uri.amap.com/marker",
        reason: "夜间收束。",
        risk: "风险较低。",
        sourceMode: "provider"
      }
    ],
    legs: [
      { fromPoi: "湖滨步行街", toPoi: "城市阳台", minutes: 35, sourceMode: "provider" },
      { fromPoi: "城市阳台", toPoi: "南宋御街", minutes: 20, degraded: true, sourceMode: "mixed" },
      { fromPoi: "南宋御街", toPoi: "夜景平台", minutes: 18, sourceMode: "provider" }
    ]
  };

  const checklist = buildPretripChecklist(card);
  const categories = checklist.map((item) => item.category);

  assert.ok(categories.includes("weather"));
  assert.ok(categories.includes("time"));
  assert.ok(categories.includes("traffic"));
  assert.ok(categories.includes("budget"));
  assert.ok(categories.includes("comfort"));
  assert.ok(checklist.length <= 5);
  assert.ok(checklist.every((item) => item.id && item.title && item.actionLabel));
});

test("buildPretripChecklist deduplicates category title pairs", () => {
  const card = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  const checklist = buildPretripChecklist({
    ...card,
    riskTips: [...card.riskTips, ...card.riskTips],
    providerWarnings: ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"]
  });
  const keys = checklist.map((item) => `${item.category}:${item.title}`);

  assert.equal(new Set(keys).size, keys.length);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL with module not found for `./pretrip-checklist` and missing checklist types.

- [ ] **Step 3: Add checklist types**

Modify `apps/web/src/domain/types.ts` after `PlanningMode`:

```ts
export type PretripChecklistCategory = "time" | "weather" | "traffic" | "booking" | "budget" | "comfort";

export type PretripChecklistSeverity = "info" | "warning" | "critical";

export type PretripChecklistItem = {
  id: string;
  category: PretripChecklistCategory;
  title: string;
  detail: string;
  severity: PretripChecklistSeverity;
  actionLabel: string;
  relatedStopId?: string;
};
```

Add to `RouteCard` after `providerWarnings?: string[];`:

```ts
  pretripChecklist?: PretripChecklistItem[];
```

- [ ] **Step 4: Implement checklist helper**

Create `apps/web/src/domain/pretrip-checklist.ts`:

```ts
import type { PretripChecklistCategory, PretripChecklistItem, PretripChecklistSeverity, RouteCard } from "./types";

type DraftChecklistItem = Omit<PretripChecklistItem, "id">;

const severityRank: Record<PretripChecklistSeverity, number> = {
  info: 1,
  warning: 2,
  critical: 3
};

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function makeItem(index: number, item: DraftChecklistItem): PretripChecklistItem {
  return {
    id: `${item.category}-${index + 1}-${slug(item.title) || "item"}`,
    ...item
  };
}

function add(items: DraftChecklistItem[], item: DraftChecklistItem) {
  items.push(item);
}

function hasOutdoorStop(routeCard: RouteCard): boolean {
  return routeCard.stops.some((stop) => !stop.tags.includes("indoor"));
}

function hasOpeningRisk(risk: string): boolean {
  return risk.includes("营业时间") || risk.includes("开放") || risk.includes("预约");
}

function totalTransitMinutes(routeCard: RouteCard): number {
  return routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);
}

export function buildPretripChecklist(routeCard: RouteCard): PretripChecklistItem[] {
  const items: DraftChecklistItem[] = [];
  const openingStop = routeCard.stops.find((stop) => hasOpeningRisk(stop.risk));
  if (openingStop) {
    add(items, {
      category: "time",
      title: "出发前确认营业状态",
      detail: `${openingStop.poi}：${openingStop.risk}`,
      severity: "warning",
      actionLabel: "确认开放时间",
      relatedStopId: openingStop.id
    });
  }

  if (hasOutdoorStop(routeCard)) {
    add(items, {
      category: "weather",
      title: "保留雨天或高温备选",
      detail: routeCard.weatherAlternative || "路线包含户外步行，出发前建议确认天气，并准备室内备选。",
      severity: routeCard.themeId === "rain_backup" ? "info" : "warning",
      actionLabel: "查看天气"
    });
  }

  const longLeg = routeCard.legs.find((leg) => leg.minutes > 30 || leg.degraded);
  if (longLeg) {
    add(items, {
      category: "traffic",
      title: longLeg.degraded ? "部分交通时间需要复核" : "这段路程可能偏长",
      detail: `${longLeg.fromPoi} 到 ${longLeg.toPoi} 预计 ${longLeg.minutes} 分钟，实际以地图导航为准。`,
      severity: longLeg.minutes > 35 || longLeg.degraded ? "warning" : "info",
      actionLabel: "打开地图复核"
    });
  }

  if (routeCard.estimatedCostCny >= 400) {
    add(items, {
      category: "budget",
      title: "预算可能偏高",
      detail: `当前预算估算约 ¥${routeCard.estimatedCostCny}，餐饮、门票和打车前建议再留余量。`,
      severity: routeCard.estimatedCostCny >= 600 ? "critical" : "warning",
      actionLabel: "检查预算"
    });
  }

  const transit = totalTransitMinutes(routeCard);
  if ((routeCard.durationDays === 1 && routeCard.stops.length >= 4) || transit > 70) {
    add(items, {
      category: "comfort",
      title: "当天节奏可能偏满",
      detail: routeCard.skipSuggestion || `${routeCard.stops.length} 个点位、约 ${transit} 分钟路上时间，建议提前确定可跳过的一站。`,
      severity: transit > 90 ? "critical" : "warning",
      actionLabel: "标记可跳过点"
    });
  }

  const bookingWarning = [...(routeCard.providerWarnings || []), ...(routeCard.riskTips || [])].find((tip) => tip.includes("预约"));
  if (bookingWarning) {
    add(items, {
      category: "booking",
      title: "确认预约或排队规则",
      detail: bookingWarning,
      severity: "warning",
      actionLabel: "确认预约"
    });
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.category}:${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])
    .slice(0, 5)
    .map((item, index) => makeItem(index, item));
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for all tests including new checklist tests.

- [ ] **Step 6: Commit domain helper**

```bash
git add apps/web/src/domain/types.ts apps/web/src/domain/pretrip-checklist.ts apps/web/src/domain/pretrip-checklist.test.ts
git commit -m "feat: add pretrip checklist rules"
```

---

### Task 2: Attach Checklist To Planners

**Files:**
- Modify: `apps/web/src/domain/planner.test.ts`
- Modify: `apps/web/src/domain/planner.ts`
- Modify: `apps/web/src/domain/real-route-planner.test.ts`
- Modify: `apps/web/src/domain/real-route-planner.ts`

- [ ] **Step 1: Add failing fallback planner assertion**

In `apps/web/src/domain/planner.test.ts`, add:

```ts
test("generateRouteCard includes a pretrip checklist", () => {
  const card = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照，别太累"
  });

  assert.ok(card.pretripChecklist);
  assert.ok(card.pretripChecklist.length >= 1);
  assert.ok(card.pretripChecklist.some((item) => item.category === "weather" || item.category === "comfort"));
});
```

- [ ] **Step 2: Add failing real planner assertions**

In `apps/web/src/domain/real-route-planner.test.ts`, inside `generateRealRouteCard falls back to local seed planner when Amap has no candidates`, after `assert.equal(card.degraded, true);`, add:

```ts
  assert.ok(card.pretripChecklist);
  assert.ok(card.pretripChecklist.length >= 1);
```

Inside `generateRealRouteCard uses Amap rule planning when real candidates exist without OpenAI`, after `assert.ok(card.arrangementReason);`, add:

```ts
  assert.ok(card.pretripChecklist);
  assert.ok(card.pretripChecklist.some((item) => item.category === "booking" || item.category === "weather"));
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because generated route cards do not yet attach `pretripChecklist`.

- [ ] **Step 4: Attach checklist in fallback planner**

Modify `apps/web/src/domain/planner.ts`.

Add import:

```ts
import { buildPretripChecklist } from "./pretrip-checklist";
```

Replace the direct `return { ... }` inside `generateRouteCard` with:

```ts
  const card: RouteCard = {
    id: randomUUID(),
    city,
    themeId: theme.id,
    themeLabel: theme.label,
    title: `${city}${label}${theme.label}`,
    summary: `${label}路线：${theme.promise} ${request.note.trim() ? `已考虑：${request.note.trim()}。` : ""}`.trim(),
    highlights: buildHighlights(stops),
    fitFor: buildFitFor(theme.label, request.note),
    riskTips: buildRiskTips(stops, degraded),
    sourceLabel: provider.getSourceLabel(),
    startDate: request.startDate,
    durationDays: request.durationDays,
    estimatedCostCny: selected.reduce((sum, poi) => sum + poi.costLevel * 80, 0),
    stops,
    legs,
    confidence,
    confidenceTier: confidence >= 0.78 ? "medium" : "needs_confirmation",
    degraded,
    degradedReason: degraded ? "city_seed_data_missing" : "",
    sourceMode: "fallback",
    share: {
      posterTitle: `${city} ${theme.label}`,
      posterSubtitle: stops.slice(0, 3).map((stop) => stop.poi).join(" · "),
      storyTitle: `把这一天过成${theme.label}`,
      storyCaption: `${stops.length} 个点位，${legs.reduce((sum, leg) => sum + leg.minutes, 0)} 分钟路上时间。`
    },
    createdAt: new Date().toISOString()
  };

  return {
    ...card,
    pretripChecklist: buildPretripChecklist(card)
  };
```

- [ ] **Step 5: Attach checklist in real planner**

Modify `apps/web/src/domain/real-route-planner.ts`.

Add import:

```ts
import { buildPretripChecklist } from "./pretrip-checklist";
```

In `assembleCard`, replace direct `return { ... }` with:

```ts
  const card: RouteCard = {
    id: randomUUID(),
    city: request.city,
    themeId: theme.id,
    themeLabel: theme.label,
    title: `${request.city}${request.durationDays === 2 ? "2日" : "1日"}${theme.label}`,
    summary: `${request.durationDays}日路线：${intentSummary}。${blueprintSummary}`,
    highlights: stops.slice(0, 3).map((stop) => `${stop.poi} 是路线主节点`),
    fitFor: `适合${intentSummary}的轻旅行用户。`,
    riskTips: providerWarnings,
    sourceLabel: mode === "ai_amap" ? "Amap real map data + AI planning" : "Amap real map data + rule planning",
    planningMode: mode,
    intentSummary,
    blueprintSummary,
    arrangementReason: arrangement.arrangementReason,
    skipSuggestion: arrangement.skipSuggestion,
    weatherAlternative: arrangement.weatherAlternative,
    providerWarnings,
    startDate: request.startDate,
    durationDays: request.durationDays,
    estimatedCostCny: stops.length * 80,
    stops,
    legs,
    confidence: mode === "ai_amap" ? 0.86 : 0.78,
    confidenceTier: mode === "ai_amap" ? "high" : "medium",
    degraded: false,
    degradedReason: "",
    sourceMode: "provider",
    share: {
      posterTitle: `${request.city} ${theme.label}`,
      posterSubtitle: stops.slice(0, 3).map((stop) => stop.poi).join(" · "),
      storyTitle: `把这一天过成${theme.label}`,
      storyCaption: `${stops.length} 个真实地点，${totalTransit} 分钟路上时间。`
    },
    createdAt: new Date().toISOString()
  };

  return {
    ...card,
    pretripChecklist: buildPretripChecklist(card)
  };
```

In fallback branch of `generateRealRouteCard`, replace:

```ts
    return {
      ...fallback,
      planningMode: "fallback_seed",
      degraded: true,
      degradedReason: "amap_candidate_supply_missing",
      sourceLabel: "本地示例数据",
      providerWarnings: ["当前使用本地示例数据，适合体验产品流程；出发前请核对真实地点。"]
    };
```

with:

```ts
    const fallbackCard: RouteCard = {
      ...fallback,
      planningMode: "fallback_seed",
      degraded: true,
      degradedReason: "amap_candidate_supply_missing",
      sourceLabel: "本地示例数据",
      providerWarnings: ["当前使用本地示例数据，适合体验产品流程；出发前请核对真实地点。"]
    };
    return {
      ...fallbackCard,
      pretripChecklist: buildPretripChecklist(fallbackCard)
    };
```

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit planner integration**

```bash
git add apps/web/src/domain/planner.ts apps/web/src/domain/planner.test.ts apps/web/src/domain/real-route-planner.ts apps/web/src/domain/real-route-planner.test.ts
git commit -m "feat: attach pretrip checklist to route cards"
```

---

### Task 3: Render Checklist In Route Card

**Files:**
- Modify: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add failing component test**

In the `routeCard` fixture in `apps/web/src/components/RouteCard.test.ts`, add after `providerWarnings`:

```ts
  pretripChecklist: [
    {
      id: "weather-1",
      category: "weather",
      title: "保留雨天或高温备选",
      detail: "路线包含户外步行，出发前建议确认天气。",
      severity: "warning",
      actionLabel: "查看天气"
    },
    {
      id: "traffic-1",
      category: "traffic",
      title: "这段路程可能偏长",
      detail: "湖滨步行街 到 城市阳台 预计 35 分钟。",
      severity: "info",
      actionLabel: "打开地图复核"
    }
  ],
```

Add assertions to the existing test:

```ts
  assert.match(markup, /出发前检查/);
  assert.match(markup, /保留雨天或高温备选/);
  assert.match(markup, /查看天气/);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `RouteCard` does not yet render checklist copy.

- [ ] **Step 3: Render checklist panel**

Modify `apps/web/src/components/RouteCard.tsx`.

Add helper functions above `RouteCard`:

```tsx
function severityLabel(severity: string): string {
  if (severity === "critical") return "高风险";
  if (severity === "warning") return "需确认";
  return "提醒";
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    time: "时间",
    weather: "天气",
    traffic: "交通",
    booking: "预约",
    budget: "预算",
    comfort: "体力"
  };
  return labels[category] || category;
}
```

Inside `RouteCard`, after `riskItems`, add:

```ts
  const checklist = routeCard.pretripChecklist || [];
  const highestSeverity = checklist.some((item) => item.severity === "critical")
    ? "critical"
    : checklist.some((item) => item.severity === "warning")
      ? "warning"
      : "info";
```

Render this block after the `risk-list` and before degraded warning:

```tsx
        {checklist.length ? (
          <section className="pretrip-panel">
            <div className="pretrip-heading">
              <div>
                <span>出发前检查</span>
                <h3>把不确定性提前处理掉</h3>
              </div>
              <div className="pretrip-summary">
                <strong>{checklist.length} 项</strong>
                <em>{severityLabel(highestSeverity)}</em>
              </div>
            </div>
            <div className="pretrip-list">
              {checklist.map((item) => (
                <div className={`pretrip-item ${item.severity}`} key={item.id}>
                  <span>{categoryLabel(item.category)}</span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <em>{item.actionLabel}</em>
                </div>
              ))}
            </div>
          </section>
        ) : null}
```

- [ ] **Step 4: Add checklist styles**

Add to `apps/web/app/globals.css` near `.risk-list` styles:

```css
.pretrip-panel {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  border: 1px solid rgba(18, 107, 67, 0.16);
  border-radius: 22px;
  background: rgba(255, 252, 242, 0.82);
  padding: 14px;
}

.pretrip-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.pretrip-heading span,
.pretrip-item span {
  display: block;
  color: var(--green);
  font-size: 12px;
  font-weight: 950;
}

.pretrip-heading h3 {
  margin: 4px 0 0;
  font-size: 22px;
  letter-spacing: -0.04em;
}

.pretrip-summary {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.pretrip-summary strong,
.pretrip-summary em {
  border-radius: 999px;
  background: #fff;
  padding: 6px 9px;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.pretrip-list {
  display: grid;
  gap: 10px;
}

.pretrip-item {
  border-left: 5px solid #86b88d;
  border-radius: 18px;
  background: #fff;
  padding: 12px;
}

.pretrip-item.warning {
  border-left-color: var(--accent);
}

.pretrip-item.critical {
  border-left-color: #d85a3a;
}

.pretrip-item strong,
.pretrip-item p,
.pretrip-item em {
  display: block;
}

.pretrip-item strong {
  margin-top: 4px;
}

.pretrip-item p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.pretrip-item em {
  margin-top: 8px;
  color: var(--ink);
  font-size: 12px;
  font-style: normal;
  font-weight: 950;
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit checklist UI**

```bash
git add apps/web/src/components/RouteCard.tsx apps/web/src/components/RouteCard.test.ts apps/web/app/globals.css
git commit -m "feat: render pretrip checklist"
```

---

### Task 4: Product Docs And Final Verification

**Files:**
- Modify: `docs/product/citywalk-route-cards-prd.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`

- [ ] **Step 1: Update PRD**

In `docs/product/citywalk-route-cards-prd.md`, under MVP Scope, add:

```md
12. Review a route-specific pretrip checklist for weather, opening, traffic, budget, and pacing risks.
```

- [ ] **Step 2: Update architecture doc**

In `docs/product/citywalk-route-cards-architecture.md`, after "Route Revision Workbench", add:

```md
## Pretrip Trust Layer

`pretrip-checklist` derives read-only departure checks from the route card itself. It does not call live weather, booking, or opening-hours services in v1. The checklist is stored as part of the route card JSON, so saved routes and share pages preserve the same trust layer.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
cd apps/web
npm run verify
```

Expected: typecheck,  tests, and build all PASS.

- [ ] **Step 4: Commit docs**

```bash
git add docs/product/citywalk-route-cards-prd.md docs/product/citywalk-route-cards-architecture.md
git commit -m "docs: document pretrip checklist"
```

- [ ] **Step 5: Push branch or main**

If implementing directly on `main`:

```bash
git push origin main
```

If implementing on a feature branch:

```bash
git push origin <branch-name>
```
