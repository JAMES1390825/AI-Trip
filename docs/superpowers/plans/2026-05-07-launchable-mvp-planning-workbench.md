# Launchable MVP Planning Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Trip's existing route planner feel like an initial launchable C-end travel planning app.

**Architecture:** Keep the current Next.js full-stack app and improve the existing planning loop. `RoutePlannerApp` owns create/save/revise state, `RouteCard` owns result presentation, `RouteInteractiveMap` owns map/stop actions, and docs/metadata support launch readiness.

**Tech Stack:** Next.js app router, React, TypeScript, Node test runner, server-side static render tests, CSS in `apps/web/app/globals.css`.

---

## File Map

- Modify `apps/web/src/components/RoutePlannerApp.tsx`: launch hero copy, trust strip, staged pending progress, improved empty preview, primary result actions, saved trips copy.
- Modify `apps/web/src/components/RoutePlannerApp.test.ts`: tests for launchable first screen, trust strip, pending progress labels, secondary share placement, and useful empty preview.
- Modify `apps/web/src/components/RouteCard.tsx`: compact launch summary header and clearer degraded/source states without changing route generation data.
- Modify `apps/web/src/components/RouteCard.test.ts`: tests for launch result hierarchy and degraded/source messaging.
- Modify `apps/web/app/globals.css`: responsive polish for hero, trust strip, progress states, empty preview, saved trips, and result action hierarchy.
- Modify `apps/web/app/layout.tsx`: Chinese-first product metadata.
- Create `apps/web/app/layout.test.ts`: metadata regression test.
- Modify `README.md`: launch/run/deploy env documentation.
- Modify `docs/product/citywalk-route-cards-prd.md`: align MVP scope with planning-first date/chips/natural-language flow.

---

### Task 1: Launchable Planner First Screen

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add failing tests for launch first screen and trust strip**

Add this test block to `apps/web/src/components/RoutePlannerApp.test.ts` after the existing light create entries test:

```ts
test("RoutePlannerApp presents a launchable planning-first first screen", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /AI 旅行规划/);
  assert.match(markup, /真实地点/);
  assert.match(markup, /公开攻略证据/);
  assert.match(markup, /先规划，再保存和调整/);
  assert.match(markup, /高德真实地点/);
  assert.match(markup, /AI 路线编排/);
  assert.match(markup, /Exa 公开证据/);
  assert.match(markup, /异常时本地兜底/);
  assert.match(markup, /生成真实行程/);
  assert.doesNotMatch(markup, /生成路线卡/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: FAIL because the current markup still says "AI Trip · 我的行程", "生成路线卡", and does not include the launch trust strip.

- [ ] **Step 3: Update planner hero and trust strip**

In `apps/web/src/components/RoutePlannerApp.tsx`, replace the opening hero copy inside `<section className="planner-panel">` with:

```tsx
<p className="eyebrow">AI 旅行规划 · 我的行程</p>
<h1>一句想法，生成真实可走的旅行路线。</h1>
<p className="hero-copy">
  先规划，再保存和调整。AI Trip 会结合真实地点、路线校验和公开攻略证据，帮你把周末 citywalk 或短途旅行变成可执行行程。
</p>
<div className="trust-strip" aria-label="规划可信来源">
  <span>高德真实地点</span>
  <span>AI 路线编排</span>
  <span>Exa 公开证据</span>
  <span>异常时本地兜底</span>
</div>
```

Change the primary generate button text from:

```tsx
{isPending ? "处理中..." : "生成路线卡"}
```

to:

```tsx
{isPending ? "规划中..." : "生成真实行程"}
```

- [ ] **Step 4: Add trust strip CSS**

In `apps/web/app/globals.css`, add after `.hero-copy`:

```css
.trust-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 8px;
}

.trust-strip span {
  border: 1px solid rgba(18, 107, 67, 0.18);
  border-radius: 999px;
  background: rgba(231, 255, 240, 0.72);
  color: var(--green);
  padding: 8px 11px;
  font-size: 12px;
  font-weight: 950;
}
```

- [ ] **Step 5: Run targeted test and verify it passes**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: PASS for all RoutePlannerApp tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: clarify launch planner first screen"
```

---

### Task 2: Staged Generation Progress And Recoverable Empty State

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add failing tests for staged progress and empty preview**

Add these tests to `apps/web/src/components/RoutePlannerApp.test.ts` after `RoutePlannerApp renders honest generation progress labels`:

```ts
test("RoutePlannerApp renders launch generation stages and retry guidance", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /理解你的旅行意图/);
  assert.match(markup, /高德检索真实地点候选/);
  assert.match(markup, /Exa 查找公开攻略证据/);
  assert.match(markup, /AI 编排并校验路线/);
  assert.match(markup, /生成风险提醒和行前检查/);
  assert.match(markup, /如果生成失败，保留输入后直接重试/);
});

test("RoutePlannerApp empty preview explains what the user will get", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /生成后会出现完整旅行工作台/);
  assert.match(markup, /真实地图路线/);
  assert.match(markup, /DAY 行程卡/);
  assert.match(markup, /来源证据/);
  assert.match(markup, /风险与行前检查/);
});
```

- [ ] **Step 2: Run targeted test and verify it fails**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: FAIL because the old generation stages and empty preview copy are still rendered.

- [ ] **Step 3: Update stage labels and status copy**

In `apps/web/src/components/RoutePlannerApp.tsx`, replace:

```ts
const generationStages = ["理解旅行需求", "高德搜索真实地点", "Exa 检索公开攻略证据", "校验路线与风险"];
```

with:

```ts
const generationStages = [
  "理解你的旅行意图",
  "高德检索真实地点候选",
  "Exa 查找公开攻略证据",
  "AI 编排并校验路线",
  "生成风险提醒和行前检查"
];
```

Replace the initial status:

```ts
const [status, setStatus] = useState("选择城市、日期和偏好，生成你的第一张路线卡。");
```

with:

```ts
const [status, setStatus] = useState("选择城市、日期和偏好，生成你的第一份真实旅行计划。");
```

Inside `generate()`, replace:

```ts
setStatus("正在生成真实行程：理解需求、搜索地点、检索证据、校验路线。");
```

with:

```ts
setStatus("正在规划：理解需求、检索真实地点、查找公开证据、校验路线。");
```

Replace the success status:

```ts
setStatus("真实行程已生成，可以继续编辑点位或保存。");
```

with:

```ts
setStatus("真实行程已生成，可以继续编辑点位、重新校验或保存。");
```

- [ ] **Step 4: Update progress panel and empty preview markup**

In `RoutePlannerApp.tsx`, replace the final paragraph inside `.generation-progress-panel` with:

```tsx
<p>这些是诚实的规划阶段提示；不展示未接入来源，也不冒充小红书官方搜索。如果生成失败，保留输入后直接重试。</p>
```

Replace:

```tsx
<div className="empty-preview">生成后这里会出现 B 型可执行路线卡。</div>
```

with:

```tsx
<div className="empty-preview">
  <p className="section-kicker">Result Preview</p>
  <h2>生成后会出现完整旅行工作台</h2>
  <div className="empty-preview-grid">
    <span>真实地图路线</span>
    <span>DAY 行程卡</span>
    <span>来源证据</span>
    <span>风险与行前检查</span>
  </div>
  <p>你可以点选地图点位、拖拽调整当天顺序、继续让 AI 少走路或加吃饭点。</p>
</div>
```

- [ ] **Step 5: Add empty preview CSS**

In `apps/web/app/globals.css`, add near the existing `.empty-preview` rules or before the first media query:

```css
.empty-preview {
  display: grid;
  gap: 16px;
  min-height: 520px;
  place-content: center;
  border: 1px dashed rgba(18, 107, 67, 0.28);
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 20%, rgba(255, 179, 64, 0.2), transparent 30%),
    linear-gradient(145deg, rgba(255, 248, 237, 0.86), rgba(231, 255, 240, 0.62));
  padding: 28px;
  text-align: left;
}

.empty-preview h2 {
  margin: 0;
  font-size: clamp(28px, 5vw, 48px);
  letter-spacing: -0.06em;
}

.empty-preview p {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}

.empty-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.empty-preview-grid span {
  border: 1px solid rgba(24, 32, 19, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  padding: 14px;
  font-weight: 950;
}
```

If an older `.empty-preview` block already exists, replace it rather than duplicating conflicting rules.

- [ ] **Step 6: Run targeted test and verify it passes**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: PASS for all RoutePlannerApp tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: add launch planning progress states"
```

---

### Task 3: Result Workbench Action Hierarchy

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add failing tests for secondary share hierarchy and My Trips copy**

Add these tests to `RoutePlannerApp.test.ts` after the empty preview test:

```ts
test("RoutePlannerApp keeps sharing secondary to planning actions", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /保存当前行程/);
  assert.match(markup, /再规划一版/);
  assert.match(markup, /分享包装/);
  assert.match(markup, /分享是附属能力，先把路线规划到能出发/);
});

test("RoutePlannerApp labels saved routes as user trips", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /我的行程库/);
  assert.match(markup, /保存后会在这里形成可再次打开的旅行计划/);
  assert.doesNotMatch(markup, /已保存<\/h3>/);
});
```

- [ ] **Step 2: Run targeted test and verify it fails**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: FAIL because current buttons still say "保存", "再生成一版", and the saved section is headed "已保存".

- [ ] **Step 3: Update primary action labels**

In `RoutePlannerApp.tsx`, change the save button in the planner panel from:

```tsx
保存
```

to:

```tsx
保存当前行程
```

In the result share actions block, replace:

```tsx
<div className="share-actions">
  <a href={sharePathFor(routeCard)} target="_blank" rel="noreferrer">
    打开分享页
  </a>
  <button onClick={() => void copyShareLink(routeCard)} type="button">
    复制分享链接
  </button>
  <button onClick={generate} type="button" disabled={isPending}>
    再生成一版
  </button>
</div>
```

with:

```tsx
<div className="result-actions">
  <button className="primary" disabled={isPending} onClick={save} type="button">
    保存当前行程
  </button>
  <button onClick={generate} type="button" disabled={isPending}>
    再规划一版
  </button>
  <a href={sharePathFor(routeCard)} target="_blank" rel="noreferrer">
    打开分享页
  </a>
  <button onClick={() => void copyShareLink(routeCard)} type="button">
    复制分享链接
  </button>
</div>
```

Replace the share switch opening:

```tsx
<div className="share-switch">
```

with:

```tsx
<div className="share-switch" aria-label="分享包装">
  <p>分享包装</p>
  <small>分享是附属能力，先把路线规划到能出发。</small>
```

Keep the existing two poster/story buttons immediately after the new text.

- [ ] **Step 4: Update saved trips copy**

In `RoutePlannerApp.tsx`, replace:

```tsx
<div className="saved-list">
  <h3>已保存</h3>
```

with:

```tsx
<div className="saved-list">
  <p className="section-kicker">My Trips</p>
  <h3>我的行程库</h3>
  <p className="saved-list-copy">保存后会在这里形成可再次打开的旅行计划。</p>
```

- [ ] **Step 5: Add action hierarchy CSS**

In `apps/web/app/globals.css`, add:

```css
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0;
}

.result-actions a,
.result-actions button {
  border: 1px solid rgba(24, 32, 19, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--ink);
  padding: 11px 14px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 950;
}

.result-actions .primary {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}

.share-switch p,
.share-switch small,
.saved-list-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
```

If `.share-actions` has styles that only served the old result block, either keep them harmless for other share cards or rename the selector to `.result-actions`.

- [ ] **Step 6: Run targeted test and verify it passes**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RoutePlannerApp.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: prioritize planning actions over sharing"
```

---

### Task 4: Route Card Trust And Degraded State Polish

**Files:**
- Modify: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add failing tests for launch trust summary and degraded state**

Add these tests to `apps/web/src/components/RouteCard.test.ts` after `RouteCard renders real planning explanation fields`:

```ts
test("RouteCard renders launch trust summary above route details", () => {
  const markup = renderToStaticMarkup(React.createElement(RouteCard, { routeCard }));

  assert.match(markup, /路线可信摘要/);
  assert.match(markup, /来源/);
  assert.match(markup, /Amap real map data \+ AI planning/);
  assert.match(markup, /公开证据/);
  assert.match(markup, /行前检查/);
});

test("RouteCard makes degraded plans explicit and actionable", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RouteCard, {
      routeCard: {
        ...routeCard,
        degraded: true,
        degradedReason: "Amap provider unavailable; used local fallback data.",
        sourceLabel: "Local fallback data"
      }
    })
  );

  assert.match(markup, /当前为可体验草案/);
  assert.match(markup, /Amap provider unavailable/);
  assert.match(markup, /出发前请复核真实地点和营业时间/);
});
```

- [ ] **Step 2: Run targeted test and verify it fails**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RouteCard.test.ts
```

Expected: FAIL because the new launch trust summary and degraded copy do not exist.

- [ ] **Step 3: Add route trust summary markup**

In `RouteCard.tsx`, after `<p className="route-summary">{routeCard.summary}</p>`, add:

```tsx
<section className="route-trust-summary" aria-label="路线可信摘要">
  <div>
    <span>路线可信摘要</span>
    <strong>{Math.round(routeCard.confidence * 100)}% 可信度</strong>
  </div>
  <div>
    <span>来源</span>
    <strong>{routeCard.sourceLabel}</strong>
  </div>
  <div>
    <span>公开证据</span>
    <strong>{evidenceSources.length ? `${evidenceSources.length} 条` : "未附加"}</strong>
  </div>
  <div>
    <span>行前检查</span>
    <strong>{checklist.length ? `${checklist.length} 项` : "无额外提醒"}</strong>
  </div>
</section>
```

- [ ] **Step 4: Replace degraded warning copy**

Replace:

```tsx
{routeCard.degraded ? <p className="warning">当前为降级草案：{routeCard.degradedReason}</p> : null}
```

with:

```tsx
{routeCard.degraded ? (
  <div className="warning warning-panel">
    <strong>当前为可体验草案</strong>
    <p>{routeCard.degradedReason}</p>
    <span>出发前请复核真实地点和营业时间。</span>
  </div>
) : null}
```

- [ ] **Step 5: Add trust summary CSS**

In `apps/web/app/globals.css`, add:

```css
.route-trust-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}

.route-trust-summary div {
  border: 1px solid rgba(18, 107, 67, 0.14);
  border-radius: 18px;
  background: rgba(231, 255, 240, 0.5);
  padding: 12px;
}

.route-trust-summary span {
  display: block;
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.route-trust-summary strong {
  display: block;
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.35;
}

.warning-panel {
  display: grid;
  gap: 6px;
  border-radius: 18px;
  padding: 14px;
}

.warning-panel p,
.warning-panel span {
  margin: 0;
}
```

Add this to the existing mobile media query:

```css
.route-trust-summary {
  grid-template-columns: 1fr 1fr;
}
```

- [ ] **Step 6: Run targeted test and verify it passes**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- src/components/RouteCard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench
git add apps/web/src/components/RouteCard.tsx apps/web/src/components/RouteCard.test.ts apps/web/app/globals.css
git commit -m "feat: clarify route trust and degraded states"
```

---

### Task 5: Launch Metadata And Docs

**Files:**
- Create: `apps/web/app/layout.test.ts`
- Modify: `apps/web/app/layout.tsx`
- Modify: `README.md`
- Modify: `docs/product/citywalk-route-cards-prd.md`

- [ ] **Step 1: Add failing metadata test**

Create `apps/web/app/layout.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { metadata } from "./layout";

test("metadata describes AI Trip as a Chinese-first travel planning app", () => {
  assert.equal(metadata.title, "AI Trip - AI 旅行规划");
  assert.match(String(metadata.description), /真实地点/);
  assert.match(String(metadata.description), /公开攻略证据/);
  assert.match(String(metadata.description), /可执行行程/);
});
```

- [ ] **Step 2: Run metadata test and verify it fails**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- app/layout.test.ts
```

Expected: FAIL because metadata still says "AI Trip Route Cards".

- [ ] **Step 3: Update metadata**

In `apps/web/app/layout.tsx`, replace metadata with:

```ts
export const metadata: Metadata = {
  title: "AI Trip - AI 旅行规划",
  description: "用真实地点、AI 路线编排和公开攻略证据生成可执行行程。"
};
```

- [ ] **Step 4: Update README launch docs**

In `README.md`, replace the introduction with:

```md
# AI Trip

AI Trip is a Node/TypeScript web full-stack MVP for C-end personal travel planning.

The product helps users turn a lightweight travel idea into an executable route workbench:

- Describe the trip in natural language.
- Pick preference chips and travel dates.
- Generate a route from real POI candidates, AI arrangement, and public web evidence.
- Review the map, daily itinerary, risks, and pre-trip checklist.
- Save, revise, and share the route as a secondary action.
```

Under `## Environment`, add:

```md
Required for the best launch-like local experience:

- `AMAP_WEB_SERVICE_KEY`: real POI candidates and walking estimates.
- `NEXT_PUBLIC_AMAP_JS_API_KEY`: in-app Amap JS map rendering.
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE`: Amap JS security code.
- `AI_PROVIDER=bailian` plus `BAILIAN_API_KEY`, or another supported AI provider.
- `SEARCH_PROVIDER=exa` plus `EXA_API_KEY`: public web evidence.

If any provider is missing or fails, the app keeps the planning flow usable through Amap-only or local fallback behavior and shows provider warnings in the route card.
```

- [ ] **Step 5: Update PRD MVP scope**

In `docs/product/citywalk-route-cards-prd.md`, replace the `## MVP Scope` numbered list with:

```md
## MVP Scope

1. Create a trip from city, date range, preference chips, and natural-language notes.
2. Optionally import a lightweight place list or existing itinerary text.
3. Generate one best route plan from the user's description; do not ask users to pick route templates.
4. Use real POI candidates, AI route arrangement, public web evidence, and local fallback behavior where configured.
5. Review map, DAY tabs, timeline, selected-stop details, route reasons, confidence, evidence, risks, and pre-trip checklist.
6. Select map markers and timeline rows inside AI Trip without leaving the app.
7. Revise a generated route with quick actions, selected-stop actions, drag reorder, or a natural-language adjustment note.
8. Save generated route cards.
9. Reopen and delete saved route cards from "My Trips".
10. Open share pages and poster/story wrappers as secondary packaging.
```

Remove outdated items that say users choose a top-level theme or one-day/two-day duration directly.

- [ ] **Step 6: Run docs/metadata tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm test -- app/layout.test.ts
```

Expected: PASS.

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench
git diff --check -- README.md docs/product/citywalk-route-cards-prd.md apps/web/app/layout.tsx apps/web/app/layout.test.ts
```

Expected: no output and exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench
git add README.md docs/product/citywalk-route-cards-prd.md apps/web/app/layout.tsx apps/web/app/layout.test.ts
git commit -m "docs: align launch mvp metadata and scope"
```

---

### Task 6: Full Verification And Browser Smoke

**Files:**
- No planned source edits unless verification finds issues.

- [ ] **Step 1: Run full verification**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm run verify
```

Expected: typecheck passes, all tests pass, build passes.

- [ ] **Step 2: Start local app**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/.worktrees/launchable-mvp-planning-workbench/apps/web
npm run dev
```

Expected: Next serves `http://localhost:3000`.

- [ ] **Step 3: Smoke test the homepage**

Open `http://localhost:3000` and verify:

- The first screen says `AI 旅行规划`.
- The primary CTA says `生成真实行程`.
- The trust strip shows Amap, AI, Exa, and fallback.
- Empty preview explains map, DAY itinerary, evidence, and checklist.
- Sharing is visually secondary to planning actions.

- [ ] **Step 4: Commit fixes if needed**

If smoke testing reveals issues, fix them with focused tests and commit:

```bash
git add <changed-files>
git commit -m "fix: polish launch mvp smoke issues"
```

If no fixes are needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: tasks cover first screen, generation progress, result hierarchy, trust/degraded states, saved trips copy, metadata, README, and PRD alignment.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: new tests use existing React static rendering pattern and existing exported metadata.
