# Route Card Usability Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve saved route sharing, route richness, and trust visibility while preserving the fallback-data-first Node Web MVP.

**Architecture:** Keep the current Next.js app and synchronous planner API. Add a small domain POI provider seam, enrich `RouteCard` data with route-level metadata, expose saved-card share links from the UI, and reuse the existing `/share/[id]` page.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Node built-in test runner through `tsx --test`, local JSON store.

---

## Source References

- Spec: `docs/superpowers/specs/2026-05-05-route-card-usability-enhancement-design.md`
- Existing planner: `apps/web/src/domain/planner.ts`
- Existing UI: `apps/web/src/components/RoutePlannerApp.tsx`
- Existing store/API: `apps/web/src/server/route-card-store.ts`, `apps/web/app/api/route-cards/route.ts`

## Planned File Structure

- Create `apps/web/src/domain/poi-provider.ts`: `PoiProvider` interface and fallback provider wrapper.
- Modify `apps/web/src/domain/types.ts`: add route metadata fields and saved share URL field.
- Modify `apps/web/src/domain/planner.ts`: use provider seam and emit highlights, fit notes, route risk tips, source labels.
- Modify `apps/web/src/domain/planner.test.ts`: add enrichment and provider fallback tests.
- Modify `apps/web/src/server/route-card-store.ts`: include saved share path in summaries.
- Modify `apps/web/src/server/route-card-store.test.ts`: assert saved summaries expose share path.
- Modify `apps/web/app/api/route-cards/route.test.ts`: assert API summary includes share path.
- Modify `apps/web/src/components/RouteCard.tsx`: render highlights, fit note, source label, and risk tips.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: save returned card, show open/copy share actions, add saved-list links.
- Modify `apps/web/app/globals.css`: style metadata and share actions.
- Modify `docs/product/citywalk-route-cards-api.md`: document route metadata and saved summary share path.

---

### Task 1: Add Provider Seam And Route Metadata Types

**Files:**
- Create: `apps/web/src/domain/poi-provider.ts`
- Modify: `apps/web/src/domain/types.ts`
- Modify: `apps/web/src/domain/planner.test.ts`

- [ ] **Step 1: Write failing provider and metadata tests**

Append to `apps/web/src/domain/planner.test.ts`:

```ts
import { fallbackPoiProvider } from "./poi-provider";

test("fallbackPoiProvider returns supported city POIs and falls back to Shanghai", () => {
  const hangzhouPois = fallbackPoiProvider.getPois("杭州");
  const unknownPois = fallbackPoiProvider.getPois("火星");

  assert.ok(fallbackPoiProvider.getSupportedCities().includes("杭州"));
  assert.ok(hangzhouPois.every((poi) => poi.city === "杭州"));
  assert.ok(unknownPois.every((poi) => poi.city === "上海"));
});

test("generateRouteCard returns route-level enrichment metadata", () => {
  const card = generateRouteCard({
    city: "成都",
    themeId: "food_linked",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想吃小吃，也想拍照"
  });

  assert.ok(card.highlights.length >= 2);
  assert.ok(card.fitFor.includes("适合"));
  assert.ok(card.riskTips.length >= 1);
  assert.equal(card.sourceLabel, "本地示例数据");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `./poi-provider` does not exist and `RouteCard` has no enrichment fields.

- [ ] **Step 3: Add route metadata types**

Modify `apps/web/src/domain/types.ts` so `RouteCard` includes:

```ts
  highlights: string[];
  fitFor: string;
  riskTips: string[];
  sourceLabel: string;
```

Add these fields immediately after `summary`.

- [ ] **Step 4: Add saved summary share path type**

Modify `SavedRouteCardSummary` in `apps/web/src/domain/types.ts` so it includes:

```ts
  sharePath: string;
```

Add it immediately after `id`.

- [ ] **Step 5: Create provider seam**

Create `apps/web/src/domain/poi-provider.ts`:

```ts
import { fallbackPois, supportedCities } from "./fallback-data";
import type { PoiSeed } from "./types";

export type PoiProvider = {
  getSupportedCities(): string[];
  getPois(city: string): PoiSeed[];
  getSourceLabel(): string;
};

export const fallbackPoiProvider: PoiProvider = {
  getSupportedCities() {
    return supportedCities;
  },
  getPois(city) {
    const cityPois = fallbackPois.filter((poi) => poi.city === city);
    return cityPois.length >= 3 ? cityPois : fallbackPois.filter((poi) => poi.city === "上海");
  },
  getSourceLabel() {
    return "本地示例数据";
  }
};
```

- [ ] **Step 6: Run tests and verify provider import works but metadata still fails**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL only on missing route metadata fields in generated cards.

- [ ] **Step 7: Keep changes staged for planner enrichment**

Do not commit yet. Task 1 intentionally leaves tests red until Task 2 adds the planner metadata implementation.

Expected: proceed immediately to Task 2 without creating a red-state commit.

---

### Task 2: Enrich Planner Output

**Files:**
- Modify: `apps/web/src/domain/planner.ts`
- Modify: `apps/web/src/domain/planner.test.ts`

- [ ] **Step 1: Import provider seam**

Modify imports in `apps/web/src/domain/planner.ts`:

```ts
import { fallbackPoiProvider, type PoiProvider } from "./poi-provider";
```

Remove the direct import of `fallbackPois` and `supportedCities`.

- [ ] **Step 2: Add helper functions**

Add these helpers before `confidenceFor` in `apps/web/src/domain/planner.ts`:

```ts
function highlightForStop(stop: RouteStop): string {
  if (stop.tags.includes("local_food") || stop.tags.includes("snack")) return `${stop.poi} 串起本地吃法`;
  if (stop.tags.includes("night")) return `${stop.poi} 适合夜间收束`;
  if (stop.tags.includes("rain_friendly") || stop.tags.includes("indoor")) return `${stop.poi} 可作为天气备选`;
  if (stop.tags.includes("photo")) return `${stop.poi} 适合边走边拍`;
  return `${stop.poi} 是路线主节点`;
}

function buildHighlights(stops: RouteStop[]): string[] {
  return Array.from(new Set(stops.map(highlightForStop))).slice(0, 3);
}

function buildFitFor(themeLabel: string, note: string): string {
  const trimmedNote = note.trim();
  if (trimmedNote) return `适合想要${themeLabel}，同时偏好“${trimmedNote}”的轻旅行用户。`;
  return `适合想要${themeLabel}、不想做复杂攻略的轻旅行用户。`;
}

function buildRiskTips(stops: RouteStop[], degraded: boolean): string[] {
  const tips = new Set<string>();
  if (degraded) tips.add("当前城市暂无种子数据，已用示例城市降级生成，请先核对点位可达性。");
  if (stops.some((stop) => stop.risk.includes("营业时间"))) tips.add("部分点位有营业时间，出发前建议再确认。");
  if (stops.some((stop) => !stop.tags.includes("indoor"))) tips.add("路线包含户外步行，雨天建议保留室内备选。");
  tips.add("交通时间为规则估算，实际以地图导航为准。");
  return Array.from(tips).slice(0, 3);
}
```

- [ ] **Step 3: Update planner to use provider and metadata**

Change the `generateRouteCard` signature to:

```ts
export function generateRouteCard(request: RouteCardRequest, provider: PoiProvider = fallbackPoiProvider): RouteCard {
```

Replace city support and pool selection with:

```ts
  const citySupported = provider.getSupportedCities().includes(city);
  const pool = provider.getPois(city);
```

Add these fields in the returned object immediately after `summary`:

```ts
    highlights: buildHighlights(stops),
    fitFor: buildFitFor(theme.label, request.note),
    riskTips: buildRiskTips(stops, degraded),
    sourceLabel: provider.getSourceLabel(),
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for all tests.

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit provider seam and planner enrichment**

Run:

```bash
git add apps/web/src/domain
git commit -m "feat: enrich route card planner output"
```

Expected: Commit succeeds with tests green.

---

### Task 3: Expose Share Paths In Store And API

**Files:**
- Modify: `apps/web/src/server/route-card-store.ts`
- Modify: `apps/web/src/server/route-card-store.test.ts`
- Modify: `apps/web/app/api/route-cards/route.test.ts`

- [ ] **Step 1: Add failing store assertion**

In `apps/web/src/server/route-card-store.test.ts`, after `assert.equal(list[0].id, card.id);`, add:

```ts
    assert.equal(list[0].sharePath, `/share/${card.id}`);
```

- [ ] **Step 2: Add failing API assertion**

In `apps/web/app/api/route-cards/route.test.ts`, after parsing `payload`, add:

```ts
    const savedItem = payload.items.find((item: { id: string }) => item.id === routeCard.id);
    assert.equal(savedItem.sharePath, `/share/${routeCard.id}`);
```

Replace the existing `assert.ok(payload.items.some(...))` line with:

```ts
    assert.ok(savedItem);
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because saved summaries do not include `sharePath`.

- [ ] **Step 4: Implement share path in summary**

Modify `summary` in `apps/web/src/server/route-card-store.ts`:

```ts
function summary(card: RouteCard): SavedRouteCardSummary {
  return {
    id: card.id,
    sharePath: `/share/${card.id}`,
    city: card.city,
    themeLabel: card.themeLabel,
    title: card.title,
    startDate: card.startDate,
    confidence: card.confidence,
    createdAt: card.createdAt
  };
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit store/API summary enhancement**

Run:

```bash
git add apps/web/src/server apps/web/app/api apps/web/src/domain/types.ts
git commit -m "feat: expose route card share paths"
```

Expected: Commit succeeds.

---

### Task 4: Render Enriched Route Metadata

**Files:**
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add metadata rendering**

In `apps/web/src/components/RouteCard.tsx`, add this block after the `.trust-panel` block and before degraded warning:

```tsx
        <div className="route-meta">
          <div>
            <span>适合人群</span>
            <p>{routeCard.fitFor}</p>
          </div>
          <div>
            <span>路线亮点</span>
            <ul>
              {routeCard.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>数据来源</span>
            <p>{routeCard.sourceLabel}</p>
          </div>
        </div>
        <div className="risk-list">
          {routeCard.riskTips.map((tip) => (
            <span key={tip}>{tip}</span>
          ))}
        </div>
```

- [ ] **Step 2: Add CSS for metadata**

Append to `apps/web/app/globals.css` before the media query:

```css
.route-meta {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.route-meta div {
  border: 1px solid rgba(24, 32, 19, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  padding: 12px;
}

.route-meta span {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
}

.route-meta p,
.route-meta ul {
  margin: 6px 0 0;
  padding: 0;
}

.route-meta li {
  margin-left: 18px;
  line-height: 1.55;
}

.risk-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.risk-list span {
  border-radius: 999px;
  background: #fff7df;
  color: #7c5200;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 800;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit route metadata UI**

Run:

```bash
git add apps/web/src/components/RouteCard.tsx apps/web/app/globals.css
git commit -m "feat: show route card trust metadata"
```

Expected: Commit succeeds.

---

### Task 5: Add Saved Share Links And Copy Action

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Update save flow to keep returned card**

In `apps/web/src/components/RoutePlannerApp.tsx`, replace the `await readJson` call inside `save()` with:

```tsx
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard })
          }),
        );
        setRouteCard(payload.routeCard);
```

- [ ] **Step 2: Add share URL helpers**

Add these functions inside `RoutePlannerApp` before `return`:

```tsx
  function sharePathFor(card: RouteCardData): string {
    return `/share/${card.id}`;
  }

  function absoluteShareUrl(card: RouteCardData): string {
    if (typeof window === "undefined") return sharePathFor(card);
    return `${window.location.origin}${sharePathFor(card)}`;
  }

  async function copyShareLink(card: RouteCardData) {
    const url = absoluteShareUrl(card);
    try {
      await navigator.clipboard.writeText(url);
      setStatus("分享链接已复制。");
    } catch {
      setStatus(`复制失败，可以手动复制：${url}`);
    }
  }
```

- [ ] **Step 3: Add current-card share actions**

In the preview panel, immediately after `<RouteCard routeCard={routeCard} />`, add:

```tsx
            <div className="share-actions">
              <a href={sharePathFor(routeCard)} target="_blank" rel="noreferrer">
                打开分享页
              </a>
              <button onClick={() => void copyShareLink(routeCard)} type="button">
                复制分享链接
              </button>
            </div>
```

- [ ] **Step 4: Add saved-list links**

Inside each `.saved-item`, after the `<span>` line, add:

```tsx
                <a href={item.sharePath} target="_blank" rel="noreferrer">
                  打开 / 分享
                </a>
```

- [ ] **Step 5: Add share actions CSS**

Append to `apps/web/app/globals.css` before the media query:

```css
.share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.share-actions a,
.share-actions button,
.saved-item a {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 9px 12px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 900;
}

.share-actions a {
  background: var(--green);
  color: #fff;
}
```

- [ ] **Step 6: Run typecheck and build**

Run:

```bash
cd apps/web
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit share UI actions**

Run:

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/app/globals.css
git commit -m "feat: add saved route share actions"
```

Expected: Commit succeeds.

---

### Task 6: Update Docs And Final Verification

**Files:**
- Modify: `docs/product/citywalk-route-cards-api.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`

- [ ] **Step 1: Update API doc for enriched route card**

In `docs/product/citywalk-route-cards-api.md`, update the example route-card response to include:

```json
    "highlights": ["西湖湖滨 是路线主节点"],
    "fitFor": "适合想要轻松 citywalk、不想做复杂攻略的轻旅行用户。",
    "riskTips": ["交通时间为规则估算，实际以地图导航为准。"],
    "sourceLabel": "本地示例数据"
```

- [ ] **Step 2: Document saved summary share path**

In `docs/product/citywalk-route-cards-api.md`, under `GET /api/route-cards`, add:

```md
Each summary includes `sharePath`, such as `/share/<id>`, for opening the saved share page.
```

- [ ] **Step 3: Update architecture doc provider section**

In `docs/product/citywalk-route-cards-architecture.md`, add this section after "Planning Model":

```md
## Provider Boundary

`apps/web/src/domain/poi-provider.ts` defines the POI provider seam. The current implementation uses `fallbackPoiProvider`, which wraps local seed data and exposes a source label for user-facing trust copy. Future AMap or AI enrichment should implement this boundary instead of bypassing the planner.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
bash scripts/dev.sh verify
```

Expected: typecheck, tests, and build pass.

- [ ] **Step 5: Commit docs and final verification changes**

Run:

```bash
git add docs/product/citywalk-route-cards-api.md docs/product/citywalk-route-cards-architecture.md
git commit -m "docs: document route card usability enhancements"
```

Expected: Commit succeeds.

---

## Final Handoff

- Run `git status --short`; expected no tracked changes.
- Run `git log --oneline -8`; verify commits are present.
- Keep the dev server stopped during implementation to avoid `apps/web/next-env.d.ts` switching between dev/build route type imports.
