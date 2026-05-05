# Node Full-Stack Citywalk Route Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Go+iOS mainline with a Node/TypeScript Web full-stack MVP for C-end citywalk route cards.

**Architecture:** Build a single `apps/web` Next.js App Router application. Domain logic lives in `apps/web/src/domain`, file-backed persistence lives in `apps/web/src/server`, API Route Handlers live in `apps/web/app/api`, and the Web UI lives in `apps/web/app` plus `apps/web/src/components`. The planner is data+rules first, with optional provider/AI enrichment later; it must never rely on pure model hallucination for POI facts.

**Tech Stack:** Node.js 20+, npm, Next.js App Router, React, TypeScript, Node built-in test runner via `tsx --test`, local JSON persistence.

---

## Source References

- Product spec: `docs/superpowers/specs/2026-05-04-c-end-citywalk-route-cards-design.md`
- Next.js App Router docs: https://nextjs.org/docs/app
- Next.js Route Handlers docs: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Next.js forms guide: https://nextjs.org/docs/guides/building-forms

## Scope Notes

This plan intentionally implements the MVP without external provider dependencies. AMap/AI keys remain future-compatible environment variables, but the first green version uses fallback city data and deterministic planning rules. That makes the migration testable before adding external services.

Actual deletion of `apps/trip-api-go` and `apps/mobile-ios` is destructive local file deletion. Even though the product direction is approved, the executor must request action-time confirmation immediately before running `git rm -r` on those directories.

## Planned File Structure

- Create `apps/web/package.json`: local app scripts and dependencies.
- Create `apps/web/next.config.mjs`: minimal Next config.
- Create `apps/web/tsconfig.json`: TypeScript config for App Router.
- Create `apps/web/app/layout.tsx`: global app shell metadata.
- Create `apps/web/app/page.tsx`: route-card landing page entry.
- Create `apps/web/app/globals.css`: editorial citywalk visual system.
- Create `apps/web/app/api/route-cards/generate/route.ts`: generate route-card endpoint.
- Create `apps/web/app/api/route-cards/route.ts`: list and save route-card endpoint.
- Create `apps/web/app/api/route-cards/[id]/route.ts`: detail and delete endpoint.
- Create `apps/web/app/share/[id]/page.tsx`: share landing page.
- Create `apps/web/src/domain/types.ts`: route-card domain types.
- Create `apps/web/src/domain/theme-catalog.ts`: six approved planning themes.
- Create `apps/web/src/domain/theme-catalog.test.ts`: theme taxonomy regression tests.
- Create `apps/web/src/domain/fallback-data.ts`: seed city and POI data.
- Create `apps/web/src/domain/planner.ts`: deterministic route-card generation.
- Create `apps/web/src/domain/planner.test.ts`: planner behavior tests.
- Create `apps/web/src/server/route-card-store.ts`: local JSON save/review store.
- Create `apps/web/src/server/route-card-store.test.ts`: store behavior tests.
- Create `apps/web/src/server/api-response.ts`: small JSON response helpers.
- Create `apps/web/src/components/RoutePlannerApp.tsx`: client UI for generation, save, list, and share selection.
- Create `apps/web/src/components/RouteCard.tsx`: B route-first display card.
- Create `apps/web/src/components/share/PosterShareCard.tsx`: A poster wrapper.
- Create `apps/web/src/components/share/StoryShareCard.tsx`: C story wrapper.
- Modify `README.md`: Node Web mainline.
- Modify `docs/README.md`: current docs map.
- Modify `docs/product/README.md`: product docs map.
- Create `docs/product/citywalk-route-cards-prd.md`: product PRD.
- Create `docs/product/citywalk-route-cards-architecture.md`: Node architecture.
- Create `docs/product/citywalk-route-cards-api.md`: API contract.
- Create `docs/product/citywalk-route-cards-tasklist.md`: tasklist and verification gates.
- Modify `scripts/dev.sh`: Node Web tasks.
- Modify `.env.example`: Node Web env variables.
- Modify `.gitignore`: ignore Next build output and local route-card data.
- Remove after confirmation: `apps/trip-api-go`, `apps/mobile-ios`, `scripts/smoke`, `infra/monitoring`, and old Go+iOS product docs.

---

### Task 1: Scaffold `apps/web`

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`
- Modify: `.gitignore`

- [ ] **Step 1: Create the app package file**

Create `apps/web/package.json` with this exact content:

```json
{
  "name": "trip-citywalk-web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit",
    "test": "sh -c 'tsx --test $(find src app -name \"*.test.ts\" -print)'",
    "verify": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "tsx": "latest",
    "typescript": "latest"
  }
}
```

- [ ] **Step 2: Create minimal Next config**

Create `apps/web/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false
};

export default nextConfig;
```

- [ ] **Step 3: Create TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create app layout**

Create `apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trip Route Cards",
  description: "Generate executable citywalk route cards for lightweight trips."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create temporary home page**

Create `apps/web/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">AI Trip · Citywalk Route Cards</p>
        <h1>生成一张能走、可信、可保存、可分享的城市路线卡。</h1>
        <p className="hero-copy">
          第一版主打 C 端年轻用户的周末 citywalk 和短途轻旅行。
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Create global CSS**

Create `apps/web/app/globals.css`:

```css
:root {
  --ink: #162013;
  --muted: #69705f;
  --paper: #fff8ed;
  --card: #ffffff;
  --line: rgba(24, 32, 19, 0.12);
  --accent: #ffb340;
  --green: #126b43;
  --night: #171b2a;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background:
    radial-gradient(circle at 12% 12%, rgba(255, 179, 64, 0.22), transparent 28%),
    linear-gradient(135deg, #f7f0df, #eef7ec 50%, #eef3ff);
  color: var(--ink);
  font-family: ui-serif, "Songti SC", "Noto Serif CJK SC", Georgia, serif;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.page-shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 56px 0 80px;
}

.hero {
  border: 1px solid var(--line);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.66);
  padding: clamp(28px, 5vw, 56px);
  box-shadow: 0 24px 80px rgba(31, 35, 22, 0.12);
}

.eyebrow {
  display: inline-flex;
  border-radius: 999px;
  background: #e7fff0;
  color: var(--green);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  max-width: 880px;
  margin: 18px 0 12px;
  font-size: clamp(42px, 7vw, 86px);
  line-height: 0.96;
  letter-spacing: -0.07em;
}

.hero-copy {
  max-width: 660px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.75;
}
```

- [ ] **Step 7: Ignore local Node artifacts**

Append these lines to the root `.gitignore` if they are not already present:

```gitignore
.next/
.data/
*.tsbuildinfo
```

Expected: Next build output, local route-card JSON storage, and TypeScript incremental cache files are ignored anywhere in the repository.

- [ ] **Step 8: Install dependencies**

Run:

```bash
cd apps/web
npm install
```

Expected: `package-lock.json` is created and dependencies install successfully.

- [ ] **Step 9: Verify scaffold typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: TypeScript exits successfully.

- [ ] **Step 10: Commit scaffold**

Run:

```bash
git add apps/web .gitignore
git commit -m "feat: scaffold node web app"
```

Expected: Commit succeeds.

---

### Task 2: Add Domain Types And Theme Catalog

**Files:**
- Create: `apps/web/src/domain/types.ts`
- Create: `apps/web/src/domain/theme-catalog.test.ts`
- Create: `apps/web/src/domain/theme-catalog.ts`

- [ ] **Step 1: Write failing theme catalog tests**

Create `apps/web/src/domain/theme-catalog.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getRouteTheme, routeThemes } from "./theme-catalog";

test("routeThemes exposes the six approved planning-oriented themes", () => {
  assert.deepEqual(
    routeThemes.map((theme) => theme.id),
    ["classic", "easy_citywalk", "rain_backup", "food_linked", "night_half_day", "low_budget"],
  );
});

test("coffee and photo are style tags, not top-level route themes", () => {
  const themeIds = routeThemes.map((theme) => theme.id);
  assert.equal(themeIds.includes("coffee_slow_walk" as never), false);
  assert.equal(themeIds.includes("film_photo" as never), false);

  const easyCitywalk = getRouteTheme("easy_citywalk");
  assert.ok(easyCitywalk.styleTags.includes("coffee"));
  assert.ok(easyCitywalk.styleTags.includes("photo"));
});

test("getRouteTheme falls back to classic when the theme is unknown", () => {
  assert.equal(getRouteTheme("unknown").id, "classic");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `./theme-catalog` does not exist.

- [ ] **Step 3: Create domain types**

Create `apps/web/src/domain/types.ts`:

```ts
export type RouteThemeId =
  | "classic"
  | "easy_citywalk"
  | "rain_backup"
  | "food_linked"
  | "night_half_day"
  | "low_budget";

export type SourceMode = "fallback" | "provider" | "mixed";

export type ConfidenceTier = "high" | "medium" | "needs_confirmation";

export type RouteTheme = {
  id: RouteThemeId;
  label: string;
  promise: string;
  primaryTags: string[];
  styleTags: string[];
  avoidTags: string[];
  defaultDurationDays: 1 | 2;
};

export type RouteCardRequest = {
  city: string;
  themeId: RouteThemeId;
  startDate: string;
  durationDays: 1 | 2;
  note: string;
};

export type PoiSeed = {
  id: string;
  city: string;
  name: string;
  tags: string[];
  lat: number;
  lng: number;
  costLevel: 1 | 2 | 3;
  indoor: boolean;
  openingHours: string;
};

export type RouteStop = {
  id: string;
  time: string;
  poiId: string;
  poi: string;
  tags: string[];
  lat: number;
  lng: number;
  mapUrl: string;
  reason: string;
  risk: string;
  sourceMode: SourceMode;
};

export type RouteLeg = {
  fromPoi: string;
  toPoi: string;
  minutes: number;
  sourceMode: SourceMode;
};

export type ShareCopy = {
  posterTitle: string;
  posterSubtitle: string;
  storyTitle: string;
  storyCaption: string;
};

export type RouteCard = {
  id: string;
  city: string;
  themeId: RouteThemeId;
  themeLabel: string;
  title: string;
  summary: string;
  startDate: string;
  durationDays: 1 | 2;
  estimatedCostCny: number;
  stops: RouteStop[];
  legs: RouteLeg[];
  confidence: number;
  confidenceTier: ConfidenceTier;
  degraded: boolean;
  degradedReason: string;
  sourceMode: SourceMode;
  share: ShareCopy;
  createdAt: string;
};

export type SavedRouteCardSummary = {
  id: string;
  city: string;
  themeLabel: string;
  title: string;
  startDate: string;
  confidence: number;
  createdAt: string;
};
```

- [ ] **Step 4: Implement theme catalog**

Create `apps/web/src/domain/theme-catalog.ts`:

```ts
import type { RouteTheme, RouteThemeId } from "./types";

export const routeThemes: RouteTheme[] = [
  {
    id: "classic",
    label: "经典初游路线",
    promise: "第一次来这座城市，先把最值得逛的核心片区串起来。",
    primaryTags: ["landmark", "culture", "walkable"],
    styleTags: ["photo", "local_food", "riverside"],
    avoidTags: [],
    defaultDurationDays: 1
  },
  {
    id: "easy_citywalk",
    label: "轻松 citywalk",
    promise: "少赶路、好逛好拍，适合周末慢慢走。",
    primaryTags: ["walkable", "street", "relaxed"],
    styleTags: ["coffee", "photo", "bookstore", "riverside"],
    avoidTags: ["long_transfer"],
    defaultDurationDays: 1
  },
  {
    id: "rain_backup",
    label: "雨天备选路线",
    promise: "天气不好也能玩，优先室内和可快速切换的点位。",
    primaryTags: ["indoor", "culture", "rain_friendly"],
    styleTags: ["exhibition", "coffee", "bookstore"],
    avoidTags: ["outdoor_only"],
    defaultDurationDays: 1
  },
  {
    id: "food_linked",
    label: "美食串联路线",
    promise: "把本地小吃、正餐和附近可逛片区串成一条线。",
    primaryTags: ["local_food", "snack", "walkable"],
    styleTags: ["coffee", "night", "market"],
    avoidTags: [],
    defaultDurationDays: 1
  },
  {
    id: "night_half_day",
    label: "夜景半日路线",
    promise: "下午出发，晚上用夜景和好吃的收束。",
    primaryTags: ["night", "riverside", "food"],
    styleTags: ["photo", "bar", "city_lights"],
    avoidTags: ["early_close"],
    defaultDurationDays: 1
  },
  {
    id: "low_budget",
    label: "低预算路线",
    promise: "少花钱也不无聊，优先免费景观、街区和实惠吃法。",
    primaryTags: ["free", "walkable", "budget_food"],
    styleTags: ["park", "street", "local_food"],
    avoidTags: ["expensive"],
    defaultDurationDays: 1
  }
];

export function getRouteTheme(themeId: string): RouteTheme {
  return routeThemes.find((theme) => theme.id === themeId) || routeThemes[0];
}

export function isRouteThemeId(value: string): value is RouteThemeId {
  return routeThemes.some((theme) => theme.id === value);
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for the three theme catalog tests.

- [ ] **Step 6: Commit theme catalog**

Run:

```bash
git add apps/web/src/domain
git commit -m "feat: add route theme catalog"
```

Expected: Commit succeeds.

---

### Task 3: Add Fallback POI Data And Route Planner

**Files:**
- Create: `apps/web/src/domain/fallback-data.ts`
- Create: `apps/web/src/domain/planner.test.ts`
- Create: `apps/web/src/domain/planner.ts`

- [ ] **Step 1: Write failing planner tests**

Create `apps/web/src/domain/planner.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "./planner";

test("generateRouteCard returns a route-first card with 3 to 5 executable stops", () => {
  const card = generateRouteCard({
    city: "杭州",
    themeId: "rain_backup",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照，别太累"
  });

  assert.equal(card.city, "杭州");
  assert.equal(card.themeId, "rain_backup");
  assert.ok(card.title.includes("杭州"));
  assert.ok(card.stops.length >= 3);
  assert.ok(card.stops.length <= 5);
  assert.equal(card.legs.length, card.stops.length - 1);
  assert.ok(card.stops.every((stop) => stop.mapUrl.includes("uri.amap.com/marker")));
  assert.ok(card.confidence > 0);
});

test("rain backup route prioritizes indoor or rain-friendly stops", () => {
  const card = generateRouteCard({
    city: "上海",
    themeId: "rain_backup",
    startDate: "2026-05-11",
    durationDays: 1,
    note: "下雨，想轻松一点"
  });

  const rainFriendlyCount = card.stops.filter((stop) =>
    stop.tags.some((tag) => ["indoor", "rain_friendly", "exhibition", "bookstore"].includes(tag)),
  ).length;

  assert.ok(rainFriendlyCount >= 2);
});

test("unknown city degrades clearly instead of pretending provider coverage exists", () => {
  const card = generateRouteCard({
    city: "火星",
    themeId: "classic",
    startDate: "2026-05-12",
    durationDays: 1,
    note: ""
  });

  assert.equal(card.degraded, true);
  assert.equal(card.sourceMode, "fallback");
  assert.equal(card.degradedReason, "city_seed_data_missing");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `./planner` does not exist.

- [ ] **Step 3: Add fallback POI seed data**

Create `apps/web/src/domain/fallback-data.ts`:

```ts
import type { PoiSeed } from "./types";

export const supportedCities = ["上海", "杭州", "苏州", "成都"];

export const fallbackPois: PoiSeed[] = [
  {
    id: "sha-wukang-road",
    city: "上海",
    name: "武康路",
    tags: ["street", "walkable", "photo", "coffee"],
    lat: 31.2058,
    lng: 121.4378,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "sha-west-bund",
    city: "上海",
    name: "西岸滨江",
    tags: ["riverside", "walkable", "photo", "free"],
    lat: 31.1844,
    lng: 121.4593,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "sha-power-station",
    city: "上海",
    name: "上海当代艺术博物馆",
    tags: ["indoor", "culture", "exhibition", "rain_friendly"],
    lat: 31.2037,
    lng: 121.4833,
    costLevel: 2,
    indoor: true,
    openingHours: "11:00-19:00"
  },
  {
    id: "sha-yuyuan",
    city: "上海",
    name: "豫园",
    tags: ["landmark", "classic", "culture", "local_food"],
    lat: 31.2272,
    lng: 121.4921,
    costLevel: 2,
    indoor: false,
    openingHours: "09:00-21:00"
  },
  {
    id: "sha-anfu-road",
    city: "上海",
    name: "安福路",
    tags: ["street", "coffee", "bookstore", "walkable"],
    lat: 31.2142,
    lng: 121.4431,
    costLevel: 2,
    indoor: false,
    openingHours: "10:00-22:00"
  },
  {
    id: "sha-bund-night",
    city: "上海",
    name: "外滩夜景",
    tags: ["night", "riverside", "landmark", "photo", "free"],
    lat: 31.2400,
    lng: 121.4900,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "hgh-west-lake",
    city: "杭州",
    name: "西湖湖滨",
    tags: ["landmark", "riverside", "walkable", "classic", "free"],
    lat: 30.2589,
    lng: 120.1303,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "hgh-china-academy",
    city: "杭州",
    name: "中国美术学院象山校区",
    tags: ["culture", "photo", "rain_friendly", "walkable"],
    lat: 30.1601,
    lng: 120.0783,
    costLevel: 1,
    indoor: true,
    openingHours: "09:00-17:00"
  },
  {
    id: "hgh-hefang",
    city: "杭州",
    name: "河坊街",
    tags: ["street", "local_food", "snack", "walkable"],
    lat: 30.2468,
    lng: 120.1688,
    costLevel: 1,
    indoor: false,
    openingHours: "10:00-22:00"
  },
  {
    id: "hgh-tea-museum",
    city: "杭州",
    name: "中国茶叶博物馆",
    tags: ["indoor", "culture", "rain_friendly", "low_budget"],
    lat: 30.2376,
    lng: 120.0991,
    costLevel: 1,
    indoor: true,
    openingHours: "09:00-17:00"
  },
  {
    id: "hgh-qinghefang-night",
    city: "杭州",
    name: "清河坊夜逛",
    tags: ["night", "street", "food", "snack"],
    lat: 30.2474,
    lng: 120.1712,
    costLevel: 1,
    indoor: false,
    openingHours: "10:00-22:30"
  },
  {
    id: "hgh-bookstore",
    city: "杭州",
    name: "晓风书屋",
    tags: ["bookstore", "indoor", "coffee", "rain_friendly"],
    lat: 30.2744,
    lng: 120.1551,
    costLevel: 2,
    indoor: true,
    openingHours: "10:00-21:00"
  },
  {
    id: "suz-pingjiang",
    city: "苏州",
    name: "平江路",
    tags: ["street", "walkable", "classic", "photo"],
    lat: 31.3156,
    lng: 120.6306,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "suz-museum",
    city: "苏州",
    name: "苏州博物馆",
    tags: ["indoor", "culture", "rain_friendly", "classic"],
    lat: 31.3242,
    lng: 120.6269,
    costLevel: 1,
    indoor: true,
    openingHours: "09:00-17:00"
  },
  {
    id: "suz-jinji-lake",
    city: "苏州",
    name: "金鸡湖夜景",
    tags: ["night", "riverside", "photo", "free"],
    lat: 31.3069,
    lng: 120.7063,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "cd-kuanzhai",
    city: "成都",
    name: "宽窄巷子",
    tags: ["classic", "street", "local_food", "walkable"],
    lat: 30.6762,
    lng: 104.0568,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "cd-dongjiao",
    city: "成都",
    name: "东郊记忆",
    tags: ["photo", "exhibition", "walkable", "coffee"],
    lat: 30.6712,
    lng: 104.1266,
    costLevel: 1,
    indoor: true,
    openingHours: "10:00-22:00"
  },
  {
    id: "cd-taikoo-li",
    city: "成都",
    name: "太古里夜逛",
    tags: ["night", "food", "walkable", "photo"],
    lat: 30.6525,
    lng: 104.0809,
    costLevel: 2,
    indoor: false,
    openingHours: "10:00-22:00"
  }
];
```

- [ ] **Step 4: Implement deterministic planner**

Create `apps/web/src/domain/planner.ts`:

```ts
import { randomUUID } from "node:crypto";
import { fallbackPois, supportedCities } from "./fallback-data";
import { getRouteTheme } from "./theme-catalog";
import type { PoiSeed, RouteCard, RouteCardRequest, RouteLeg, RouteStop } from "./types";

const stopTimes = ["10:00", "12:20", "15:00", "19:30"];

function normalizeCity(city: string): string {
  return city.trim() || "上海";
}

function noteTags(note: string): string[] {
  const text = note.toLowerCase();
  const tags: string[] = [];
  if (text.includes("咖啡") || text.includes("coffee")) tags.push("coffee");
  if (text.includes("拍照") || text.includes("photo") || text.includes("出片")) tags.push("photo");
  if (text.includes("雨")) tags.push("rain_friendly", "indoor");
  if (text.includes("小吃") || text.includes("吃")) tags.push("snack", "local_food");
  if (text.includes("少走") || text.includes("轻松") || text.includes("别太累")) tags.push("walkable", "relaxed");
  return tags;
}

function scorePoi(poi: PoiSeed, desiredTags: string[], avoidTags: string[]): number {
  let score = 0;
  for (const tag of desiredTags) {
    if (poi.tags.includes(tag)) score += 12;
  }
  for (const tag of avoidTags) {
    if (poi.tags.includes(tag)) score -= 20;
  }
  if (poi.indoor && desiredTags.includes("rain_friendly")) score += 10;
  score -= (poi.costLevel - 1) * 2;
  return score;
}

function estimateTransitMinutes(from: PoiSeed, to: PoiSeed): number {
  const latDiff = Math.abs(from.lat - to.lat);
  const lngDiff = Math.abs(from.lng - to.lng);
  const roughDistance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  return Math.max(8, Math.min(42, Math.round(roughDistance * 900 + 10)));
}

function mapUrlForPoi(poi: PoiSeed): string {
  return `https://uri.amap.com/marker?position=${poi.lng},${poi.lat}&name=${encodeURIComponent(poi.name)}`;
}

function reasonForPoi(poi: PoiSeed, themeLabel: string): string {
  if (poi.tags.includes("rain_friendly")) return `${poi.name} 适合 ${themeLabel}，天气变化时也容易调整停留时间。`;
  if (poi.tags.includes("local_food") || poi.tags.includes("snack")) return `${poi.name} 可以把吃和逛串在一起，减少单独找餐厅的决策成本。`;
  if (poi.tags.includes("night")) return `${poi.name} 适合作为当天收束点，夜间氛围更完整。`;
  if (poi.tags.includes("photo")) return `${poi.name} 出片点位集中，适合边走边拍。`;
  return `${poi.name} 和路线主题匹配，适合放进当天主线。`;
}

function riskForPoi(poi: PoiSeed): string {
  if (!poi.indoor && poi.tags.includes("outdoor_only")) return "户外停留较多，雨天建议准备备选点。";
  if (poi.openingHours !== "全天开放") return `营业时间参考 ${poi.openingHours}，出发前建议再确认。`;
  return "风险较低，适合按当前顺序前往。";
}

function buildStops(selected: PoiSeed[], themeLabel: string): RouteStop[] {
  return selected.map((poi, index) => ({
    id: `${index + 1}-${poi.id}`,
    time: stopTimes[index] || `${10 + index * 2}:00`,
    poiId: poi.id,
    poi: poi.name,
    tags: poi.tags,
    lat: poi.lat,
    lng: poi.lng,
    mapUrl: mapUrlForPoi(poi),
    reason: reasonForPoi(poi, themeLabel),
    risk: riskForPoi(poi),
    sourceMode: "fallback"
  }));
}

function buildLegs(selected: PoiSeed[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let index = 1; index < selected.length; index += 1) {
    legs.push({
      fromPoi: selected[index - 1].name,
      toPoi: selected[index].name,
      minutes: estimateTransitMinutes(selected[index - 1], selected[index]),
      sourceMode: "fallback"
    });
  }
  return legs;
}

function confidenceFor(stops: RouteStop[], degraded: boolean): number {
  const base = degraded ? 0.48 : 0.72;
  const tagCoverage = Math.min(0.18, stops.length * 0.035);
  return Math.round((base + tagCoverage) * 100) / 100;
}

export function generateRouteCard(request: RouteCardRequest): RouteCard {
  const city = normalizeCity(request.city);
  const theme = getRouteTheme(request.themeId);
  const citySupported = supportedCities.includes(city);
  const cityPois = fallbackPois.filter((poi) => poi.city === city);
  const pool = citySupported && cityPois.length >= 3 ? cityPois : fallbackPois.filter((poi) => poi.city === "上海");
  const desiredTags = [...theme.primaryTags, ...theme.styleTags, ...noteTags(request.note)];
  const selected = [...pool]
    .sort((left, right) => scorePoi(right, desiredTags, theme.avoidTags) - scorePoi(left, desiredTags, theme.avoidTags))
    .slice(0, 4);

  const stops = buildStops(selected, theme.label);
  const legs = buildLegs(selected);
  const degraded = !citySupported;
  const confidence = confidenceFor(stops, degraded);

  return {
    id: randomUUID(),
    city,
    themeId: theme.id,
    themeLabel: theme.label,
    title: `${city}${theme.label}`,
    summary: `${theme.promise} ${request.note.trim() ? `已考虑：${request.note.trim()}。` : ""}`.trim(),
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
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for theme and planner tests.

- [ ] **Step 6: Commit planner**

Run:

```bash
git add apps/web/src/domain
git commit -m "feat: add route card planner"
```

Expected: Commit succeeds.

---

### Task 4: Add File-Backed Save/Review Store

**Files:**
- Create: `apps/web/src/server/route-card-store.test.ts`
- Create: `apps/web/src/server/route-card-store.ts`

- [ ] **Step 1: Write failing store tests**

Create `apps/web/src/server/route-card-store.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "../domain/planner";
import { createRouteCardStore } from "./route-card-store";

test("route card store saves, lists, loads, and deletes cards", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "route-card-store-"));
  const store = createRouteCardStore(path.join(dir, "cards.json"));
  const card = generateRouteCard({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  await store.save(card);
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, card.id);

  const loaded = await store.get(card.id);
  assert.equal(loaded?.title, card.title);

  assert.equal(await store.delete(card.id), true);
  assert.equal(await store.get(card.id), null);
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `./route-card-store` does not exist.

- [ ] **Step 3: Implement local JSON store**

Create `apps/web/src/server/route-card-store.ts`:

```ts
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RouteCard, SavedRouteCardSummary } from "../domain/types";

type StoreState = {
  version: 1;
  routeCards: RouteCard[];
};

export type RouteCardStore = {
  save(card: RouteCard): Promise<RouteCard>;
  list(): Promise<SavedRouteCardSummary[]>;
  get(id: string): Promise<RouteCard | null>;
  delete(id: string): Promise<boolean>;
};

const defaultDataFile = process.env.ROUTE_CARD_DATA_FILE || path.join(process.cwd(), ".data", "route-cards.json");

async function readState(dataFile: string): Promise<StoreState> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as StoreState;
    return {
      version: 1,
      routeCards: Array.isArray(parsed.routeCards) ? parsed.routeCards : []
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { version: 1, routeCards: [] };
    }
    throw error;
  }
}

async function writeState(dataFile: string, state: StoreState): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const tmpPath = `${dataFile}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await rm(dataFile, { force: true });
  await rename(tmpPath, dataFile);
}

function summary(card: RouteCard): SavedRouteCardSummary {
  return {
    id: card.id,
    city: card.city,
    themeLabel: card.themeLabel,
    title: card.title,
    startDate: card.startDate,
    confidence: card.confidence,
    createdAt: card.createdAt
  };
}

export function createRouteCardStore(dataFile = defaultDataFile): RouteCardStore {
  return {
    async save(card) {
      const state = await readState(dataFile);
      const nextCards = [card, ...state.routeCards.filter((item) => item.id !== card.id)];
      await writeState(dataFile, { version: 1, routeCards: nextCards });
      return card;
    },
    async list() {
      const state = await readState(dataFile);
      return state.routeCards.map(summary);
    },
    async get(id) {
      const state = await readState(dataFile);
      return state.routeCards.find((card) => card.id === id) || null;
    },
    async delete(id) {
      const state = await readState(dataFile);
      const nextCards = state.routeCards.filter((card) => card.id !== id);
      if (nextCards.length === state.routeCards.length) return false;
      await writeState(dataFile, { version: 1, routeCards: nextCards });
      return true;
    }
  };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for theme, planner, and store tests.

- [ ] **Step 5: Commit store**

Run:

```bash
git add apps/web/src/server
git commit -m "feat: add route card store"
```

Expected: Commit succeeds.

---

### Task 5: Add API Route Handlers

**Files:**
- Create: `apps/web/src/server/api-response.ts`
- Create: `apps/web/app/api/route-cards/generate/route.test.ts`
- Create: `apps/web/app/api/route-cards/generate/route.ts`
- Create: `apps/web/app/api/route-cards/route.test.ts`
- Create: `apps/web/app/api/route-cards/route.ts`
- Create: `apps/web/app/api/route-cards/[id]/route.ts`

- [ ] **Step 1: Write failing generate route tests**

Create `apps/web/app/api/route-cards/generate/route.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("POST /api/route-cards/generate returns a generated route card", async () => {
  const response = await POST(
    new Request("http://localhost/api/route-cards/generate", {
      method: "POST",
      body: JSON.stringify({
        city: "杭州",
        themeId: "easy_citywalk",
        startDate: "2026-05-10",
        durationDays: 1,
        note: "想拍照"
      })
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.routeCard.city, "杭州");
  assert.ok(payload.routeCard.stops.length >= 3);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `./route` does not exist.

- [ ] **Step 3: Add API response helper**

Create `apps/web/src/server/api-response.ts`:

```ts
export function jsonOk(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}
```

- [ ] **Step 4: Implement generate route handler**

Create `apps/web/app/api/route-cards/generate/route.ts`:

```ts
import { generateRouteCard } from "@/domain/planner";
import { isRouteThemeId } from "@/domain/theme-catalog";
import type { RouteCardRequest } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";

export const dynamic = "force-dynamic";

function asRequestBody(value: unknown): RouteCardRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const city = String(body.city || "").trim();
  const themeId = String(body.themeId || "").trim();
  const startDate = String(body.startDate || "").trim();
  const durationDays = Number(body.durationDays || 1);
  const note = String(body.note || "").trim();

  if (!city || !isRouteThemeId(themeId) || !startDate || (durationDays !== 1 && durationDays !== 2)) {
    return null;
  }

  return { city, themeId, startDate, durationDays, note };
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }

  const body = asRequestBody(raw);
  if (!body) {
    return jsonError(400, "BAD_REQUEST", "city, themeId, startDate, and durationDays are required.");
  }

  return jsonOk({ routeCard: generateRouteCard(body) });
}
```

- [ ] **Step 5: Run generate route tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for generate route handler and existing tests.

- [ ] **Step 6: Add route-card list/save handlers**

Create `apps/web/app/api/route-cards/route.ts`:

```ts
import type { RouteCard } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";
import { createRouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

const store = createRouteCardStore();

function isRouteCard(value: unknown): value is RouteCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<RouteCard>;
  return Boolean(card.id && card.city && card.title && Array.isArray(card.stops));
}

export async function GET(): Promise<Response> {
  return jsonOk({ items: await store.list() });
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }

  const routeCard = (raw as { routeCard?: unknown }).routeCard;
  if (!isRouteCard(routeCard)) {
    return jsonError(400, "BAD_REQUEST", "routeCard is required.");
  }

  return jsonOk({ routeCard: await store.save(routeCard) }, 201);
}
```

- [ ] **Step 7: Add route-card detail/delete handlers**

Create `apps/web/app/api/route-cards/[id]/route.ts`:

```ts
import { jsonError, jsonOk } from "@/server/api-response";
import { createRouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

const store = createRouteCardStore();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const routeCard = await store.get(id);
  if (!routeCard) return jsonError(404, "NOT_FOUND", "Route card not found.");
  return jsonOk({ routeCard });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const deleted = await store.delete(id);
  if (!deleted) return jsonError(404, "NOT_FOUND", "Route card not found.");
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 8: Write list/save tests**

Create `apps/web/app/api/route-cards/route.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";

test("POST /api/route-cards saves a generated route card and GET lists summaries", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "route-cards-api-"));
  process.env.ROUTE_CARD_DATA_FILE = path.join(tempDir, "route-cards.json");

  try {
    const { GET, POST } = await import("./route");
    const routeCard = generateRouteCard({
      city: "上海",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: ""
    });

    const saveResponse = await POST(
      new Request("http://localhost/api/route-cards", {
        method: "POST",
        body: JSON.stringify({ routeCard })
      }),
    );
    assert.equal(saveResponse.status, 201);

    const listResponse = await GET();
    assert.equal(listResponse.status, 200);
    const payload = await listResponse.json();
    assert.ok(payload.items.some((item: { id: string }) => item.id === routeCard.id));
  } finally {
    delete process.env.ROUTE_CARD_DATA_FILE;
    await rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 9: Run API tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for all domain, store, and API tests.

- [ ] **Step 10: Commit API handlers**

Run:

```bash
git add apps/web/app/api apps/web/src/server
git commit -m "feat: add route card api"
```

Expected: Commit succeeds.

---

### Task 6: Build Route-First Web UI

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/src/components/RoutePlannerApp.tsx`
- Create: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Replace the home page with the app entry**

Replace `apps/web/app/page.tsx` with:

```tsx
import { RoutePlannerApp } from "@/components/RoutePlannerApp";

export default function HomePage() {
  return (
    <main className="page-shell">
      <RoutePlannerApp />
    </main>
  );
}
```

- [ ] **Step 2: Create route card renderer**

Create `apps/web/src/components/RouteCard.tsx`:

```tsx
import type { RouteCard as RouteCardData } from "@/domain/types";

export function RouteCard({ routeCard }: { routeCard: RouteCardData }) {
  const totalTransit = routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);

  return (
    <article className="route-card">
      <div className="route-map">
        {routeCard.stops.map((stop, index) => (
          <span
            className="map-pin"
            key={stop.id}
            style={{ left: `${18 + index * 21}%`, top: `${32 + (index % 2) * 22}%` }}
          >
            {index + 1}
          </span>
        ))}
      </div>
      <div className="route-card-body">
        <div className="chip-row">
          <span className="chip">{routeCard.themeLabel}</span>
          <span className="chip chip-light">{routeCard.city}</span>
          <span className="chip chip-light">{routeCard.durationDays} 日</span>
        </div>
        <h2>{routeCard.title}</h2>
        <p className="route-summary">{routeCard.summary}</p>
        <div className="timeline">
          {routeCard.stops.map((stop) => (
            <a className="timeline-row" href={stop.mapUrl} key={stop.id} rel="noreferrer" target="_blank">
              <span className="time">{stop.time}</span>
              <span>
                <strong>{stop.poi}</strong>
                <em>{stop.reason}</em>
              </span>
            </a>
          ))}
        </div>
        <div className="trust-panel">
          <div>
            <span>可信度</span>
            <strong>{Math.round(routeCard.confidence * 100)}%</strong>
          </div>
          <div>
            <span>路上时间</span>
            <strong>{totalTransit} 分钟</strong>
          </div>
          <div>
            <span>预算估算</span>
            <strong>¥{routeCard.estimatedCostCny}</strong>
          </div>
        </div>
        {routeCard.degraded ? <p className="warning">当前为降级草案：{routeCard.degradedReason}</p> : null}
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Create client planner UI**

Create `apps/web/src/components/RoutePlannerApp.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { routeThemes } from "@/domain/theme-catalog";
import type { RouteCard as RouteCardData, SavedRouteCardSummary } from "@/domain/types";
import { RouteCard } from "./RouteCard";

const cityOptions = ["上海", "杭州", "苏州", "成都"];

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload.message || "请求失败"));
  }
  return response.json() as Promise<T>;
}

export function RoutePlannerApp() {
  const [city, setCity] = useState("杭州");
  const [themeId, setThemeId] = useState(routeThemes[0].id);
  const [startDate, setStartDate] = useState("2026-05-10");
  const [note, setNote] = useState("想拍照，别太累");
  const [routeCard, setRouteCard] = useState<RouteCardData | null>(null);
  const [saved, setSaved] = useState<SavedRouteCardSummary[]>([]);
  const [status, setStatus] = useState("选择城市和主题，生成你的第一张路线卡。");
  const [isPending, startTransition] = useTransition();

  async function loadSaved() {
    const payload = await readJson<{ items: SavedRouteCardSummary[] }>(await fetch("/api/route-cards"));
    setSaved(payload.items);
  }

  useEffect(() => {
    void loadSaved().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  function generate() {
    startTransition(async () => {
      try {
        setStatus("正在生成路线卡...");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city, themeId, startDate, durationDays: 1, note })
          }),
        );
        setRouteCard(payload.routeCard);
        setStatus("路线卡已生成，可以保存或切换分享包装。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function save() {
    if (!routeCard) return;
    startTransition(async () => {
      try {
        await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard })
          }),
        );
        await loadSaved();
        setStatus("已保存路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  return (
    <div className="app-grid">
      <section className="planner-panel">
        <p className="eyebrow">AI Trip · Route Cards</p>
        <h1>把周末旅行变成一张能走的路线卡。</h1>
        <p className="hero-copy">B 型路线卡是核心体验：地图、时间线、可信度、保存和分享都围绕它展开。</p>

        <div className="form-grid">
          <label>
            城市
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {cityOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            日期
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
          </label>
        </div>

        <div className="theme-grid">
          {routeThemes.map((theme) => (
            <button
              className={theme.id === themeId ? "theme-button active" : "theme-button"}
              key={theme.id}
              onClick={() => setThemeId(theme.id)}
              type="button"
            >
              <strong>{theme.label}</strong>
              <span>{theme.promise}</span>
            </button>
          ))}
        </div>

        <label>
          补充偏好
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <div className="action-row">
          <button className="primary" disabled={isPending} onClick={generate} type="button">
            {isPending ? "处理中..." : "生成路线卡"}
          </button>
          <button disabled={!routeCard || isPending} onClick={save} type="button">
            保存
          </button>
        </div>
        <p className="status">{status}</p>

        <div className="saved-list">
          <h3>已保存</h3>
          {saved.length ? (
            saved.map((item) => (
              <div className="saved-item" key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.city} · {item.themeLabel} · {Math.round(item.confidence * 100)}%</span>
              </div>
            ))
          ) : (
            <p>还没有保存的路线卡。</p>
          )}
        </div>
      </section>

      <section className="preview-panel">
        {routeCard ? (
          <>
            <RouteCard routeCard={routeCard} />
            <div className="share-placeholder">
              A 海报包装和 C 故事包装会在下一步接入；当前先保证 B 型路线卡可生成、可信、可保存。
            </div>
          </>
        ) : (
          <div className="empty-preview">生成后这里会出现 B 型可执行路线卡。</div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Append UI CSS**

Append this to `apps/web/app/globals.css`:

```css
.app-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(360px, 1.1fr);
  gap: 24px;
  align-items: start;
}

.planner-panel,
.preview-panel,
.route-card,
.share-card {
  border: 1px solid var(--line);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 24px 80px rgba(31, 35, 22, 0.12);
}

.planner-panel,
.preview-panel {
  padding: 24px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

label {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  color: var(--ink);
  padding: 12px 14px;
}

textarea {
  min-height: 92px;
  resize: vertical;
}

.theme-grid {
  display: grid;
  gap: 10px;
  margin: 18px 0;
}

.theme-button {
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #fff;
  padding: 14px;
}

.theme-button.active {
  border-color: var(--ink);
  background: #fff2ce;
}

.theme-button strong,
.theme-button span {
  display: block;
}

.theme-button span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.action-row,
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.action-row button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 11px 16px;
  font-weight: 900;
}

.action-row .primary {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}

.share-placeholder {
  margin-top: 18px;
  border: 1px dashed var(--line);
  border-radius: 22px;
  color: var(--muted);
  padding: 16px;
  line-height: 1.6;
}

.status,
.saved-list p {
  color: var(--muted);
  line-height: 1.6;
}

.saved-list {
  margin-top: 24px;
}

.saved-item {
  display: grid;
  gap: 4px;
  border-top: 1px solid var(--line);
  padding: 12px 0;
}

.saved-item span {
  color: var(--muted);
  font-size: 13px;
}

.route-card {
  overflow: hidden;
  background: #fbf1df;
}

.route-map {
  position: relative;
  height: 220px;
  background:
    linear-gradient(90deg, transparent 49%, rgba(48, 78, 57, 0.16) 50%, transparent 51%),
    linear-gradient(0deg, transparent 49%, rgba(48, 78, 57, 0.16) 50%, transparent 51%),
    #dcebd2;
  background-size: 44px 44px;
}

.map-pin {
  position: absolute;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 999px;
  background: var(--accent);
  color: var(--ink);
  font-weight: 950;
}

.route-card-body {
  padding: 20px;
}

.route-card h2 {
  margin: 14px 0 8px;
  font-size: 34px;
  line-height: 1;
  letter-spacing: -0.06em;
}

.route-summary {
  color: var(--muted);
  line-height: 1.6;
}

.chip {
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 900;
}

.chip-light {
  background: #fff;
  color: var(--muted);
}

.timeline {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.timeline-row {
  display: grid;
  grid-template-columns: 58px 1fr;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.time {
  color: #8a6a2f;
  font-size: 12px;
  font-weight: 950;
}

.timeline-row strong,
.timeline-row em {
  display: block;
}

.timeline-row em {
  margin-top: 3px;
  color: var(--muted);
  font-size: 13px;
  font-style: normal;
  line-height: 1.5;
}

.trust-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 18px;
}

.trust-panel div {
  border-radius: 16px;
  background: #fff;
  padding: 12px;
}

.trust-panel span,
.trust-panel strong {
  display: block;
}

.trust-panel span {
  color: var(--muted);
  font-size: 12px;
}

.trust-panel strong {
  margin-top: 4px;
  color: var(--green);
}

.warning {
  border-radius: 16px;
  background: #fff3d1;
  color: #7c5200;
  padding: 12px;
}

.empty-preview {
  display: grid;
  min-height: 420px;
  place-items: center;
  border: 1px dashed var(--line);
  border-radius: 28px;
  color: var(--muted);
}

@media (max-width: 980px) {
  .app-grid,
  .form-grid,
  .trust-panel {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
cd apps/web
npm run build
```

Expected: PASS and production build completes.

- [ ] **Step 7: Commit Web UI**

Run:

```bash
git add apps/web/app apps/web/src/components
git commit -m "feat: build route card web ui"
```

Expected: Commit succeeds.

---

### Task 7: Add Poster And Story Share Wrappers

**Files:**
- Create: `apps/web/src/components/share/PosterShareCard.tsx`
- Create: `apps/web/src/components/share/StoryShareCard.tsx`
- Create: `apps/web/app/share/[id]/page.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Create poster share component**

Create `apps/web/src/components/share/PosterShareCard.tsx`:

```tsx
import type { RouteCard } from "@/domain/types";

export function PosterShareCard({ routeCard }: { routeCard: RouteCard }) {
  return (
    <section className="share-card poster-card">
      <p>Poster</p>
      <h2>{routeCard.share.posterTitle}</h2>
      <span>{routeCard.share.posterSubtitle}</span>
      <small>AI Trip · 生成同款路线</small>
    </section>
  );
}
```

- [ ] **Step 2: Create story share component**

Create `apps/web/src/components/share/StoryShareCard.tsx`:

```tsx
import type { RouteCard } from "@/domain/types";

export function StoryShareCard({ routeCard }: { routeCard: RouteCard }) {
  return (
    <section className="share-card story-card">
      <div className="photo-stack" aria-hidden="true">
        <span />
        <span />
      </div>
      <h2>{routeCard.share.storyTitle}</h2>
      <p>{routeCard.share.storyCaption}</p>
      <small>扫码生成同款 citywalk</small>
    </section>
  );
}
```

- [ ] **Step 3: Connect share wrappers to the main UI**

Modify `apps/web/src/components/RoutePlannerApp.tsx`:

- Add imports for `PosterShareCard` and `StoryShareCard` below the `RouteCard` import.
- Add `type ShareMode = "poster" | "story";` below the imports.
- Add `const [shareMode, setShareMode] = useState<ShareMode>("poster");` after the `status` state.
- Replace the `.share-placeholder` block with:

```tsx
            <div className="share-switch">
              <button className={shareMode === "poster" ? "active" : ""} onClick={() => setShareMode("poster")} type="button">
                海报包装
              </button>
              <button className={shareMode === "story" ? "active" : ""} onClick={() => setShareMode("story")} type="button">
                故事包装
              </button>
            </div>
            {shareMode === "poster" ? <PosterShareCard routeCard={routeCard} /> : <StoryShareCard routeCard={routeCard} />}
```

Expected: the main UI keeps B route-card as the skeleton and lets users switch between A poster packaging and C story packaging.

- [ ] **Step 4: Add share landing page**

Create `apps/web/app/share/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { RouteCard } from "@/components/RouteCard";
import { PosterShareCard } from "@/components/share/PosterShareCard";
import { StoryShareCard } from "@/components/share/StoryShareCard";
import { createRouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const routeCard = await createRouteCardStore().get(id);

  if (!routeCard) {
    return (
      <main className="page-shell">
        <div className="empty-preview">
          <p>这张路线卡不存在或已经删除。</p>
          <Link href="/">生成一张新的路线卡</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell share-page">
      <Link className="home-link" href="/">生成同款</Link>
      <RouteCard routeCard={routeCard} />
      <PosterShareCard routeCard={routeCard} />
      <StoryShareCard routeCard={routeCard} />
    </main>
  );
}
```

- [ ] **Step 5: Append share CSS**

Append to `apps/web/app/globals.css`:

```css
.share-card {
  margin-top: 18px;
  min-height: 260px;
  padding: 24px;
  overflow: hidden;
}

.share-card p,
.share-card small,
.share-card span {
  display: block;
}

.share-card h2 {
  margin: 14px 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.share-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.share-switch button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 11px 16px;
  font-weight: 900;
}

.share-switch .active {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}

.poster-card {
  background: linear-gradient(145deg, #f6b13e, #e76755, #251913);
  color: #fff;
}

.story-card {
  position: relative;
  background: linear-gradient(145deg, #6ed5c1, #5548a9, #172033);
  color: #fff;
}

.photo-stack {
  position: relative;
  height: 120px;
}

.photo-stack span {
  position: absolute;
  display: block;
  width: 120px;
  height: 150px;
  border: 8px solid #fff;
  border-bottom-width: 28px;
  border-radius: 18px;
  background: linear-gradient(135deg, #ffcf5a, #ef6d75 50%, #5049a8);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24);
}

.photo-stack span:first-child {
  left: 8px;
  top: 8px;
  transform: rotate(-8deg);
}

.photo-stack span:last-child {
  left: 112px;
  top: 20px;
  transform: rotate(7deg);
  background: linear-gradient(135deg, #7ed7c1, #f7e2aa 55%, #283b5f);
}

.share-page {
  display: grid;
  gap: 18px;
}

.home-link {
  color: var(--ink);
  font-weight: 900;
}
```

- [ ] **Step 6: Run typecheck and build**

Run:

```bash
cd apps/web
npm run typecheck
npm run build
```

Expected: Both commands pass.

- [ ] **Step 7: Commit share wrappers**

Run:

```bash
git add apps/web/app apps/web/src/components
git commit -m "feat: add route card share wrappers"
```

Expected: Commit succeeds.

---

### Task 8: Rewrite Docs And Dev Scripts For Node Web

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/product/README.md`
- Create: `docs/product/citywalk-route-cards-prd.md`
- Create: `docs/product/citywalk-route-cards-architecture.md`
- Create: `docs/product/citywalk-route-cards-api.md`
- Create: `docs/product/citywalk-route-cards-tasklist.md`
- Modify: `scripts/dev.sh`
- Modify: `.env.example`

- [ ] **Step 1: Rewrite root README**

Replace `README.md` with:

```md
# AI Trip Route Cards

Current mainline: **Node/TypeScript Web full-stack app** for C-end citywalk route cards.

The product helps young users generate a themed route card that is:

- Easy to walk.
- Easy to trust.
- Easy to save.
- Easy to share.

## Active Runtime

- Web app: `apps/web`
- Product docs: `docs/product`
- Local scripts: `scripts/dev.sh`

Retired from the current mainline:

- Go backend.
- Native iOS app.
- Community feed.
- Personalization learning system.
- Booking flows.

## Quick Start

```bash
bash scripts/dev.sh install
bash scripts/dev.sh dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
bash scripts/dev.sh test
bash scripts/dev.sh typecheck
bash scripts/dev.sh build
bash scripts/dev.sh verify
```

## Environment

Copy `.env.example` to `.env.local` if needed.

The MVP works without provider keys by using local fallback data. Provider and AI integrations are optional future-compatible configuration.
```

- [ ] **Step 2: Rewrite docs index**

Replace `docs/README.md` with:

```md
# AI Trip Docs

Current docs describe the Node/TypeScript Web full-stack route-card product.

## Recommended Reading Order

1. [../README.md](../README.md)
2. [product/README.md](./product/README.md)
3. [product/citywalk-route-cards-prd.md](./product/citywalk-route-cards-prd.md)
4. [product/citywalk-route-cards-architecture.md](./product/citywalk-route-cards-architecture.md)
5. [product/citywalk-route-cards-api.md](./product/citywalk-route-cards-api.md)
6. [product/citywalk-route-cards-tasklist.md](./product/citywalk-route-cards-tasklist.md)
```

- [ ] **Step 3: Rewrite product docs map**

Replace `docs/product/README.md` with:

```md
# Product Docs Map

Current product line:

`C-end citywalk route cards + Node/TypeScript Web full-stack app`

## Current Documents

- [citywalk-route-cards-prd.md](./citywalk-route-cards-prd.md)
- [citywalk-route-cards-architecture.md](./citywalk-route-cards-architecture.md)
- [citywalk-route-cards-api.md](./citywalk-route-cards-api.md)
- [citywalk-route-cards-tasklist.md](./citywalk-route-cards-tasklist.md)
```

- [ ] **Step 4: Add product PRD**

Create `docs/product/citywalk-route-cards-prd.md`:

```md
# Citywalk Route Cards PRD

## Goal

Help C-end young users generate themed, executable citywalk route cards for weekend and short city trips.

## Core User Problem

Users want a route that is attractive enough to share but concrete enough to actually follow.

## MVP Scope

1. Choose city, theme, date, and note.
2. Generate a B route-first card.
3. Review timeline, map links, reasons, risk, and confidence.
4. Save route cards.
5. Review saved cards.
6. Export A poster or C story share wrappers.

## First Themes

1. Classic first-time route.
2. Easy citywalk.
3. Rain-friendly backup route.
4. Food-linked route.
5. Night-view half-day route.
6. Low-budget route.

## Non-Goals

- Native iOS app.
- Go backend.
- Community feed.
- Booking.
- Multi-user collaboration.
```

- [ ] **Step 5: Add architecture doc**

Create `docs/product/citywalk-route-cards-architecture.md`:

```md
# Citywalk Route Cards Architecture

## Runtime

Single Node/TypeScript Web app in `apps/web`.

## Layers

1. UI: `apps/web/app` and `apps/web/src/components`.
2. API: Next.js Route Handlers in `apps/web/app/api`.
3. Domain: route themes, fallback data, planner in `apps/web/src/domain`.
4. Persistence: local JSON store in `apps/web/src/server`.

## Planning Model

The MVP uses data and rules first:

- Fallback POI seed data defines available facts.
- Theme catalog defines planning intent.
- Planner scores and orders POIs.
- AI/provider integrations can enrich later, but the model must not invent facts.

## Persistence

Local JSON file at `.data/route-cards.json` by default.
```

- [ ] **Step 6: Add API doc**

Create `docs/product/citywalk-route-cards-api.md`:

```md
# Citywalk Route Cards API

## `POST /api/route-cards/generate`

Request:

```json
{
  "city": "杭州",
  "themeId": "easy_citywalk",
  "startDate": "2026-05-10",
  "durationDays": 1,
  "note": "想拍照，别太累"
}
```

Response:

```json
{
  "routeCard": {
    "id": "uuid",
    "city": "杭州",
    "themeId": "easy_citywalk",
    "title": "杭州轻松 citywalk"
  }
}
```

## `GET /api/route-cards`

Returns saved route-card summaries.

## `POST /api/route-cards`

Saves a generated route card.

## `GET /api/route-cards/:id`

Returns one saved route card.

## `DELETE /api/route-cards/:id`

Deletes one saved route card.
```

- [ ] **Step 7: Add tasklist doc**

Create `docs/product/citywalk-route-cards-tasklist.md`:

```md
# Citywalk Route Cards Tasklist

## Phase 1

1. Scaffold Node Web app.
2. Add theme catalog.
3. Add fallback POI data and planner.
4. Add save/review store.
5. Add API routes.
6. Add route-first Web UI.
7. Add poster/story share wrappers.

## Verification Gates

1. `npm test` passes in `apps/web`.
2. `npm run typecheck` passes in `apps/web`.
3. `npm run build` passes in `apps/web`.
4. `bash scripts/dev.sh verify` passes at repo root.
```

- [ ] **Step 8: Rewrite dev script**

Replace `scripts/dev.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

TASK="${1:-help}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/dev.sh <task>

Tasks:
  help       Show this help
  install    Install web dependencies
  dev        Start Next.js dev server
  test       Run web tests
  typecheck  Run TypeScript typecheck
  build      Build web app
  verify     Run typecheck + test + build
EOF
}

run_web() {
  cd "$WEB_DIR"
  "$@"
}

case "$TASK" in
  help)
    print_help
    ;;
  install)
    run_web npm install
    ;;
  dev)
    run_web npm run dev
    ;;
  test)
    run_web npm test
    ;;
  typecheck)
    run_web npm run typecheck
    ;;
  build)
    run_web npm run build
    ;;
  verify)
    run_web npm run verify
    ;;
  *)
    echo "Unknown task: $TASK" >&2
    print_help
    exit 1
    ;;
esac
```

- [ ] **Step 9: Rewrite env example**

Replace `.env.example` with:

```dotenv
# Local route-card storage. Defaults to apps/web/.data/route-cards.json when unset.
ROUTE_CARD_DATA_FILE=

# Optional future provider integrations.
AMAP_API_KEY=
AMAP_BASE_URL=https://restapi.amap.com
AMAP_TIMEOUT_MS=3500

# Optional future AI enrichment.
AI_SERVICE_BASE_URL=
AI_SERVICE_API_KEY=
AI_SERVICE_MODEL_NAME=
AI_SERVICE_TIMEOUT_MS=4000
```

- [ ] **Step 10: Run docs/script verification**

Run:

```bash
bash scripts/dev.sh help
bash scripts/dev.sh typecheck
bash scripts/dev.sh test
```

Expected: help prints Node Web tasks; typecheck and tests pass.

- [ ] **Step 11: Commit docs and scripts**

Run:

```bash
git add README.md docs .env.example scripts/dev.sh
git commit -m "docs: reset mainline to node route cards"
```

Expected: Commit succeeds.

---

### Task 9: Remove Retired Go/iOS Mainline Artifacts

**Files:**
- Delete after confirmation: `apps/trip-api-go`
- Delete after confirmation: `apps/mobile-ios`
- Delete after confirmation: `scripts/smoke`
- Delete after confirmation: `infra/monitoring`
- Delete after confirmation: old `docs/product/trip-core-planning-*.md`
- Delete after confirmation: `docs/adr/ADR-001-tech-stack-and-boundaries.md` or replace it with a new Node ADR.
- Create: `docs/adr/ADR-002-node-web-mainline.md`

- [ ] **Step 1: Ask action-time confirmation before destructive deletion**

Before running deletion, ask the user:

```text
Ready to remove retired Go/iOS mainline files from the local workspace: apps/trip-api-go, apps/mobile-ios, scripts/smoke, infra/monitoring, and old trip-core product docs. This deletes local files from the working tree, though they remain in git history. Do you confirm?
```

Expected: proceed only after explicit confirmation.

- [ ] **Step 2: Remove retired directories and docs after confirmation**

Run only after confirmation:

```bash
git rm -r apps/trip-api-go apps/mobile-ios scripts/smoke infra/monitoring
git rm docs/product/trip-core-planning-prd.md docs/product/trip-core-planning-architecture.md docs/product/trip-core-planning-api.md docs/product/trip-core-planning-tasklist.md
git rm docs/adr/ADR-001-tech-stack-and-boundaries.md
```

Expected: files are staged as deleted.

- [ ] **Step 3: Add new ADR**

Create `docs/adr/ADR-002-node-web-mainline.md`:

```md
# ADR-002: Node Web Mainline

- Date: 2026-05-04
- Status: Active

## Context

The product direction has shifted from Go backend + iOS app to a C-end Web product for citywalk route cards.

## Decision

Adopt a single Node/TypeScript Web full-stack runtime in `apps/web`.

## Consequences

Positive:

- Faster iteration for C-end Web route-card validation.
- One language across UI, API, and domain logic.
- Easier share-card and route-detail distribution through URLs.

Trade-offs:

- Native iOS map SDK work is retired from the active mainline.
- Go backend persistence and tests are replaced by Node equivalents.
- Production-grade persistence remains a later step.
```

- [ ] **Step 4: Verify no active docs mention Go+iOS as current mainline**

Run:

```bash
rg -n "Go backend \\+ iOS|trip-api-go|mobile-ios|Current Mainline PRD|Python AI service" README.md docs scripts apps/web
```

Expected: no matches that describe Go+iOS as the active current line. Matches inside historical plan/spec text are acceptable only if clearly framed as retired.

- [ ] **Step 5: Run full verification**

Run:

```bash
bash scripts/dev.sh verify
```

Expected: typecheck, tests, and build pass.

- [ ] **Step 6: Commit retirement cleanup**

Run:

```bash
git add docs/adr/ADR-002-node-web-mainline.md
git commit -m "chore: retire go ios mainline"
```

Expected: Commit succeeds.

---

### Task 10: Final Verification And Handoff

**Files:**
- No new files expected.

- [ ] **Step 1: Run final status check**

Run:

```bash
git status --short
```

Expected: no unstaged or staged changes.

- [ ] **Step 2: Run final verification**

Run:

```bash
bash scripts/dev.sh verify
```

Expected: all checks pass.

- [ ] **Step 3: Optional browser smoke**

Run:

```bash
bash scripts/dev.sh dev
```

Open `http://localhost:3000` in the in-app browser. Generate a Hangzhou easy citywalk route, save it, switch between poster/story wrappers, and open a map link.

Expected:

- Route card renders.
- Save updates the saved list.
- Poster/story wrappers render.
- Map links open externally or in a new tab.

- [ ] **Step 4: Summarize completion**

Final response should include:

```text
Implemented Node/TypeScript Web mainline in apps/web, retired Go/iOS artifacts, and verified with bash scripts/dev.sh verify.
```

Expected: no mention of tests passing unless the command output has been observed.

---

## Self-Review Checklist

- Spec coverage: the plan covers route generation, six themes, route-first B card, A/C share wrappers, save/review/delete, Node full-stack reset, docs, scripts, and retired Go/iOS removal.
- Placeholder scan: no implementation task uses TBD/TODO placeholders.
- Type consistency: `RouteCard`, `RouteThemeId`, `SavedRouteCardSummary`, `generateRouteCard`, and `createRouteCardStore` are defined before use in later tasks.
- Risk check: destructive deletion is gated behind explicit action-time confirmation.
