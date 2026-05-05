# Route Card Management Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add saved-route preview, delete, regeneration, and duration selection to complete the route-card usage loop.

**Architecture:** Reuse the existing Next.js app, route-card API, local JSON store, and deterministic planner. Extend planner behavior for one-day vs two-day route length, add API tests for existing detail/delete endpoints, then wire the main client UI to load/delete saved routes and regenerate from current form state.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Node built-in test runner through `tsx --test`, local JSON store.

---

## Source References

- Spec: `docs/superpowers/specs/2026-05-05-route-card-management-regeneration-design.md`
- Planner: `apps/web/src/domain/planner.ts`
- Route API: `apps/web/app/api/route-cards/[id]/route.ts`
- Main UI: `apps/web/src/components/RoutePlannerApp.tsx`
- Store: `apps/web/src/server/route-card-store.ts`

## Planned File Structure

- Modify `apps/web/src/domain/planner.test.ts`: add duration route-length and title/summary tests.
- Modify `apps/web/src/domain/planner.ts`: make `durationDays` affect stop count and title/summary.
- Create `apps/web/app/api/route-cards/route-detail.test.ts`: test detail and delete handlers.
- Modify `apps/web/src/components/RoutePlannerApp.tsx`: add duration selector, preview saved card, delete saved card, regenerate.
- Modify `apps/web/app/globals.css`: style saved actions, duration selector, and preview actions.
- Modify `docs/product/citywalk-route-cards-api.md`: document detail/delete use from main page.
- Modify `docs/product/citywalk-route-cards-prd.md`: document management loop.

---

### Task 1: Make Duration Visible In Planner

**Files:**
- Modify: `apps/web/src/domain/planner.test.ts`
- Modify: `apps/web/src/domain/planner.ts`

- [x] **Step 1: Add failing duration tests**

Append to `apps/web/src/domain/planner.test.ts`:

```ts
test("two-day routes include more stops than one-day routes when seed data allows", () => {
  const oneDay = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: ""
  });
  const twoDay = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 2,
    note: ""
  });

  assert.ok(oneDay.stops.length <= 4);
  assert.ok(twoDay.stops.length > oneDay.stops.length);
  assert.ok(twoDay.stops.length <= 6);
});

test("route title and summary reflect duration days", () => {
  const card = generateRouteCard({
    city: "成都",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 2,
    note: "想轻松"
  });

  assert.ok(card.title.includes("2日"));
  assert.ok(card.summary.includes("2日"));
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because two-day routes still have the same stop count and title/summary do not mention duration.

- [x] **Step 3: Add duration helpers**

Add these helpers in `apps/web/src/domain/planner.ts` before `generateRouteCard`:

```ts
function stopCountForDuration(durationDays: 1 | 2, poolSize: number): number {
  const desired = durationDays === 2 ? 6 : 4;
  return Math.max(3, Math.min(desired, poolSize));
}

function durationLabel(durationDays: 1 | 2): string {
  return durationDays === 2 ? "2日" : "1日";
}
```

- [x] **Step 4: Use duration in planner selection and copy**

In `generateRouteCard`, before selecting POIs, add:

```ts
  const stopCount = stopCountForDuration(request.durationDays, pool.length);
  const label = durationLabel(request.durationDays);
```

Replace `.slice(0, 4)` with:

```ts
    .slice(0, stopCount);
```

Replace the returned `title` and `summary` fields with:

```ts
    title: `${city}${label}${theme.label}`,
    summary: `${label}路线：${theme.promise} ${request.note.trim() ? `已考虑：${request.note.trim()}。` : ""}`.trim(),
```

- [x] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [x] **Step 6: Run typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit duration planner changes**

Run:

```bash
git add apps/web/src/domain/planner.ts apps/web/src/domain/planner.test.ts
git commit -m "feat: support multi-day route generation"
```

Expected: Commit succeeds.

---

### Task 2: Test Detail And Delete Route Handlers

**Files:**
- Create: `apps/web/app/api/route-cards/route-detail.test.ts`

- [x] **Step 1: Create detail/delete tests**

Create `apps/web/app/api/route-cards/route-detail.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";

test("GET and DELETE /api/route-cards/:id load and remove a saved route card", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "route-cards-detail-api-"));
  process.env.ROUTE_CARD_DATA_FILE = path.join(tempDir, "route-cards.json");

  try {
    const listRoute = await import("./route");
    const detailRoute = await import("./[id]/route");
    const routeCard = generateRouteCard({
      city: "苏州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: ""
    });

    await listRoute.POST(
      new Request("http://localhost/api/route-cards", {
        method: "POST",
        body: JSON.stringify({ routeCard })
      }),
    );

    const context = { params: Promise.resolve({ id: routeCard.id }) };
    const detailResponse = await detailRoute.GET(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.routeCard.id, routeCard.id);

    const deleteResponse = await detailRoute.DELETE(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
    assert.equal(deleteResponse.status, 204);

    const missingResponse = await detailRoute.GET(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
    assert.equal(missingResponse.status, 404);
  } finally {
    delete process.env.ROUTE_CARD_DATA_FILE;
    await rm(tempDir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run tests**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS, because detail/delete handlers already exist. If this fails due module caching with `ROUTE_CARD_DATA_FILE`, fix the test by importing routes only after setting the environment variable as shown above.

- [x] **Step 3: Commit detail/delete API tests**

Run:

```bash
git add apps/web/app/api/route-cards/route-detail.test.ts
git commit -m "test: cover route card detail delete api"
```

Expected: Commit succeeds.

---

### Task 3: Add Duration, Preview, Delete, And Regenerate UI

**Files:**
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/app/globals.css`

- [x] **Step 1: Add duration state**

In `apps/web/src/components/RoutePlannerApp.tsx`, add this state after `startDate`:

```tsx
  const [durationDays, setDurationDays] = useState<1 | 2>(1);
```

- [x] **Step 2: Use duration in generate body**

Replace `durationDays: 1` in the generate request body with:

```tsx
durationDays
```

- [x] **Step 3: Add duration selector in the form grid**

After the date label in the `.form-grid`, add:

```tsx
          <label>
            时长
            <select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value) as 1 | 2)}>
              <option value={1}>1日</option>
              <option value={2}>2日</option>
            </select>
          </label>
```

- [x] **Step 4: Add saved-route load/delete helpers**

Add these functions inside `RoutePlannerApp` before `return`:

```tsx
  function loadSavedPreview(id: string) {
    startTransition(async () => {
      try {
        setStatus("正在载入保存的路线卡...");
        const payload = await readJson<{ routeCard: RouteCardData }>(await fetch(`/api/route-cards/${id}`));
        setRouteCard(payload.routeCard);
        setCity(payload.routeCard.city);
        setThemeId(payload.routeCard.themeId);
        setStartDate(payload.routeCard.startDate);
        setDurationDays(payload.routeCard.durationDays);
        setStatus("已载入保存的路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function deleteSaved(id: string) {
    startTransition(async () => {
      try {
        setStatus("正在删除路线卡...");
        const response = await fetch(`/api/route-cards/${id}`, { method: "DELETE" });
        if (!response.ok && response.status !== 204) {
          throw new Error("删除失败，请稍后再试。");
        }
        if (routeCard?.id === id) setRouteCard(null);
        await loadSaved();
        setStatus("已删除路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }
```

- [x] **Step 5: Add regenerate action**

The existing `generate()` already regenerates with current state after Step 2. In the preview panel, add a button inside `.share-actions` after copy button:

```tsx
              <button onClick={generate} type="button" disabled={isPending}>
                再生成一版
              </button>
```

- [x] **Step 6: Replace saved row action link with action row**

Replace the single saved-list `<a>` with:

```tsx
                <div className="saved-actions">
                  <button onClick={() => loadSavedPreview(item.id)} type="button" disabled={isPending}>
                    预览
                  </button>
                  <a href={item.sharePath} target="_blank" rel="noreferrer">
                    打开 / 分享
                  </a>
                  <button onClick={() => deleteSaved(item.id)} type="button" disabled={isPending}>
                    删除
                  </button>
                </div>
```

- [x] **Step 7: Add CSS**

Append to `apps/web/app/globals.css` before the media query:

```css
.saved-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.saved-actions button,
.saved-actions a {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 8px 10px;
  text-decoration: none;
  font-size: 12px;
  font-weight: 900;
}

.saved-actions button:last-child {
  color: #9b3b24;
}
```

- [x] **Step 8: Run typecheck and build**

Run:

```bash
cd apps/web
npm run typecheck
npm run build
```

Expected: PASS.

- [x] **Step 9: Commit UI management loop**

Run:

```bash
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/app/globals.css
git commit -m "feat: add route card management actions"
```

Expected: Commit succeeds.

---

### Task 4: Update Product Docs And Verify

**Files:**
- Modify: `docs/product/citywalk-route-cards-prd.md`
- Modify: `docs/product/citywalk-route-cards-api.md`

- [x] **Step 1: Update PRD management scope**

In `docs/product/citywalk-route-cards-prd.md`, under "MVP Scope", add:

```md
7. Reopen saved routes in the preview.
8. Delete saved routes.
9. Regenerate another route from the current preferences.
10. Choose one-day or two-day duration.
```

- [x] **Step 2: Update API doc for detail/delete usage**

In `docs/product/citywalk-route-cards-api.md`, under `GET /api/route-cards/:id`, add:

```md
Used by the main page to load a saved route back into the preview panel.
```

Under `DELETE /api/route-cards/:id`, add:

```md
Used by the main page saved-list delete action.
```

- [x] **Step 3: Run full verification**

Run:

```bash
bash scripts/dev.sh verify
```

Expected: typecheck, tests, and build pass.

- [x] **Step 4: Commit docs**

Run:

```bash
git add docs/product/citywalk-route-cards-prd.md docs/product/citywalk-route-cards-api.md
git commit -m "docs: document route card management loop"
```

Expected: Commit succeeds.

---

## Final Handoff

- Run `git status --short`; expected no tracked changes.
- Merge branch back to `main`.
- Run `bash scripts/dev.sh verify` on `main`.
- Restart the app server on `http://localhost:3000`.
