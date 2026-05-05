# Real AI + Amap Route Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first production-shaped real route generation pipeline: user intent, AI blueprint, Amap real POIs, AI candidate-only arrangement, route-time enrichment, graceful fallback, and user-facing trust copy.

**Architecture:** Keep the current local seed planner as the final fallback. Add focused domain modules for user intent, route blueprint, candidate arrangement, and real-route orchestration. Add server-only clients for Amap and OpenAI with injectable fetchers so tests use fixtures instead of real credentials.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Node built-in test runner through `tsx --test`, server-side `fetch`, OpenAI Responses API by HTTP, Amap Web Service APIs by HTTP, local JSON persistence.

---

## Source References

- Spec: `docs/superpowers/specs/2026-05-05-real-ai-amap-route-planning-design.md`
- Current planner fallback: `apps/web/src/domain/planner.ts`
- Current types: `apps/web/src/domain/types.ts`
- Theme tags: `apps/web/src/domain/theme-catalog.ts`
- Generate API: `apps/web/app/api/route-cards/generate/route.ts`
- Route card UI: `apps/web/src/components/RouteCard.tsx`

## Planned File Structure

- Modify `apps/web/src/domain/types.ts`: add optional real-provider route fields and `PlanningMode`.
- Create `apps/web/src/domain/user-intent.ts`: infer user intent from theme and note, plus display summary.
- Create `apps/web/src/domain/user-intent.test.ts`: TDD for note/theme intent fallback.
- Create `apps/web/src/domain/route-blueprint.ts`: rule blueprint fallback, Amap query slot mapping, schema types.
- Create `apps/web/src/domain/route-blueprint.test.ts`: TDD for blueprint and query mapping.
- Create `apps/web/src/server/amap-client.ts`: normalize Amap POI search and walking route responses.
- Create `apps/web/src/server/amap-client.test.ts`: TDD with fixture responses.
- Create `apps/web/src/domain/route-arrangement.ts`: candidate types, AI arrangement validation, deterministic fallback arrangement.
- Create `apps/web/src/domain/route-arrangement.test.ts`: TDD for whitelist, duplicate, day, count, and fallback behavior.
- Create `apps/web/src/server/openai-route-client.ts`: OpenAI structured-output HTTP wrapper and response parsing.
- Create `apps/web/src/server/openai-route-client.test.ts`: TDD with fake fetch responses, no real key.
- Create `apps/web/src/domain/real-route-planner.ts`: orchestrate AI/Amap/rule/local fallback into a `RouteCard`.
- Create `apps/web/src/domain/real-route-planner.test.ts`: TDD for no-key, Amap-only, AI+Amap, and fallback modes.
- Modify `apps/web/app/api/route-cards/generate/route.ts`: call real planner instead of local planner directly.
- Modify `apps/web/src/components/RouteCard.tsx`: display planning mode, explanation fields, provider warnings, address, and day labels.
- Modify `apps/web/app/globals.css`: styles for explanation/trust additions.
- Modify `docs/product/citywalk-route-cards-api.md`: document env-driven real planning modes.
- Modify `docs/product/citywalk-route-cards-architecture.md`: document new provider and AI orchestration boundaries.

---

### Task 1: Extend Route Types For Real Planning Metadata

**Files:**
- Modify: `apps/web/src/domain/types.ts`

- [ ] **Step 1: Add optional route metadata types**

Edit `apps/web/src/domain/types.ts`:

```ts
export type PlanningMode = "ai_amap" | "rule_amap" | "fallback_seed";
```

Extend `RouteStop` with optional fields:

```ts
  providerPoiId?: string;
  address?: string;
  providerType?: string;
  day?: 1 | 2;
```

Extend `RouteLeg` with optional fields:

```ts
  degraded?: boolean;
```

Extend `RouteCard` with optional fields:

```ts
  planningMode?: PlanningMode;
  intentSummary?: string;
  blueprintSummary?: string;
  arrangementReason?: string;
  skipSuggestion?: string;
  weatherAlternative?: string;
  providerWarnings?: string[];
```

Expected: existing code compiles because all new fields are optional.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit type additions**

Run:

```bash
git add apps/web/src/domain/types.ts
git commit -m "feat: add real route planning metadata types"
```

Expected: Commit succeeds.

---

### Task 2: Add User Intent Fallback Extraction

**Files:**
- Create: `apps/web/src/domain/user-intent.ts`
- Create: `apps/web/src/domain/user-intent.test.ts`

- [ ] **Step 1: Write failing intent tests**

Create `apps/web/src/domain/user-intent.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { inferUserIntent } from "./user-intent";

test("inferUserIntent extracts relaxed photo intent from note and theme", () => {
  const intent = inferUserIntent({
    themeId: "easy_citywalk",
    note: "想拍照，别太累，下午出发"
  });

  assert.equal(intent.physicalPace, "relaxed");
  assert.equal(intent.startRhythm, "afternoon_start");
  assert.ok(intent.interestWeights.photo > intent.interestWeights.shopping);
  assert.ok(intent.avoidConstraints.includes("别太累"));
  assert.match(intent.intentSummary, /轻松|拍照/);
});

test("inferUserIntent extracts family and budget constraints", () => {
  const intent = inferUserIntent({
    themeId: "low_budget",
    note: "带爸妈，预算低，少走路"
  });

  assert.equal(intent.travelerProfile, "parents");
  assert.equal(intent.budgetPosture, "low");
  assert.equal(intent.physicalPace, "low_walking");
  assert.ok(intent.mustHaveConstraints.includes("带爸妈"));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `user-intent.ts` does not exist.

- [ ] **Step 3: Implement user intent module**

Create `apps/web/src/domain/user-intent.ts`:

```ts
import type { RouteThemeId } from "./types";

export type TravelerProfile = "solo" | "couple" | "friends" | "family" | "parents" | "kids" | "unknown";
export type PhysicalPace = "relaxed" | "normal" | "packed" | "low_walking" | "unknown";
export type BudgetPosture = "low" | "normal" | "flexible" | "unknown";
export type StartRhythm = "early_start" | "late_start" | "afternoon_start" | "night_first" | "unknown";

export type InterestWeights = {
  classic: number;
  photo: number;
  food: number;
  coffee: number;
  shopping: number;
  culture: number;
  nature: number;
  nightlife: number;
  rainSafety: number;
};

export type UserIntent = {
  travelerProfile: TravelerProfile;
  physicalPace: PhysicalPace;
  budgetPosture: BudgetPosture;
  startRhythm: StartRhythm;
  interestWeights: InterestWeights;
  mustHaveConstraints: string[];
  avoidConstraints: string[];
  confidence: number;
  intentSummary: string;
};

export type IntentInput = {
  themeId: RouteThemeId;
  note: string;
};

const baseWeights: InterestWeights = {
  classic: 1,
  photo: 1,
  food: 1,
  coffee: 1,
  shopping: 0,
  culture: 1,
  nature: 1,
  nightlife: 0,
  rainSafety: 0
};

function withThemeWeights(themeId: RouteThemeId): InterestWeights {
  const weights = { ...baseWeights };
  if (themeId === "classic") weights.classic += 3;
  if (themeId === "easy_citywalk") {
    weights.photo += 2;
    weights.coffee += 1;
  }
  if (themeId === "rain_backup") rainSafe(weights);
  if (themeId === "food_linked") weights.food += 3;
  if (themeId === "night_half_day") weights.nightlife += 3;
  if (themeId === "low_budget") weights.nature += 1;
  return weights;
}

function rainSafe(weights: InterestWeights) {
  weights.rainSafety += 3;
  weights.culture += 1;
  weights.coffee += 1;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function inferUserIntent(input: IntentInput): UserIntent {
  const note = input.note.trim();
  const weights = withThemeWeights(input.themeId);
  const mustHaveConstraints: string[] = [];
  const avoidConstraints: string[] = [];

  if (includesAny(note, ["拍照", "出片", "photo"])) weights.photo += 3;
  if (includesAny(note, ["吃", "小吃", "美食"])) weights.food += 3;
  if (includesAny(note, ["咖啡", "coffee"])) weights.coffee += 3;
  if (includesAny(note, ["雨", "下雨"])) rainSafe(weights);
  if (includesAny(note, ["夜", "夜景", "晚上"])) weights.nightlife += 2;

  const travelerProfile: TravelerProfile = includesAny(note, ["爸妈", "父母", "老人"])
    ? "parents"
    : includesAny(note, ["孩子", "小孩", "亲子"])
      ? "kids"
      : includesAny(note, ["朋友", "闺蜜", "同学"])
        ? "friends"
        : "unknown";

  const physicalPace: PhysicalPace = includesAny(note, ["少走", "少走路"])
    ? "low_walking"
    : includesAny(note, ["轻松", "别太累", "不赶"])
      ? "relaxed"
      : includesAny(note, ["多逛", "充实", "特种兵"])
        ? "packed"
        : input.themeId === "easy_citywalk"
          ? "relaxed"
          : "normal";

  const budgetPosture: BudgetPosture = includesAny(note, ["预算低", "省钱", "低预算"])
    ? "low"
    : input.themeId === "low_budget"
      ? "low"
      : "normal";

  const startRhythm: StartRhythm = includesAny(note, ["下午"])
    ? "afternoon_start"
    : includesAny(note, ["晚上", "夜"])
      ? "night_first"
      : includesAny(note, ["早起", "一早"])
        ? "early_start"
        : "unknown";

  if (includesAny(note, ["带爸妈", "预算低", "拍照", "咖啡", "小吃"])) {
    for (const phrase of ["带爸妈", "预算低", "拍照", "咖啡", "小吃"]) {
      if (note.includes(phrase)) mustHaveConstraints.push(phrase);
    }
  }
  if (includesAny(note, ["别太累", "少走路", "不赶"])) {
    for (const phrase of ["别太累", "少走路", "不赶"]) {
      if (note.includes(phrase)) avoidConstraints.push(phrase);
    }
  }

  const summaryParts: string[] = [];
  if (physicalPace === "relaxed" || physicalPace === "low_walking") summaryParts.push("轻松");
  if (weights.photo >= 4) summaryParts.push("拍照友好");
  if (weights.food >= 4) summaryParts.push("美食优先");
  if (budgetPosture === "low") summaryParts.push("低预算");
  if (travelerProfile === "parents") summaryParts.push("照顾爸妈体力");

  return {
    travelerProfile,
    physicalPace,
    budgetPosture,
    startRhythm,
    interestWeights: weights,
    mustHaveConstraints,
    avoidConstraints,
    confidence: note ? 0.74 : 0.52,
    intentSummary: summaryParts.length ? summaryParts.join("，") : "按主题生成基础路线"
  };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit user intent module**

Run:

```bash
git add apps/web/src/domain/user-intent.ts apps/web/src/domain/user-intent.test.ts
git commit -m "feat: infer route user intent"
```

Expected: Commit succeeds.

---

### Task 3: Add Route Blueprint And Amap Query Slots

**Files:**
- Create: `apps/web/src/domain/route-blueprint.ts`
- Create: `apps/web/src/domain/route-blueprint.test.ts`

- [ ] **Step 1: Write failing blueprint tests**

Create `apps/web/src/domain/route-blueprint.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackBlueprint, searchSlotsToAmapQueries } from "./route-blueprint";
import { inferUserIntent } from "./user-intent";

test("buildFallbackBlueprint creates abstract search slots without concrete POI names", () => {
  const intent = inferUserIntent({ themeId: "classic", note: "想拍照，别太累" });
  const blueprint = buildFallbackBlueprint({
    city: "杭州",
    themeId: "classic",
    durationDays: 2,
    note: "想拍照，别太累",
    intent
  });

  assert.equal(blueprint.days.length, 2);
  assert.ok(blueprint.searchSlots.some((slot) => slot.intent.includes("classic")));
  assert.ok(blueprint.searchSlots.some((slot) => slot.tags.includes("photo")));
  assert.ok(!blueprint.searchSlots.some((slot) => slot.query.includes("西湖")));
});

test("searchSlotsToAmapQueries maps slots to city-scoped keyword queries", () => {
  const intent = inferUserIntent({ themeId: "food_linked", note: "想吃小吃" });
  const blueprint = buildFallbackBlueprint({
    city: "成都",
    themeId: "food_linked",
    durationDays: 1,
    note: "想吃小吃",
    intent
  });

  const queries = searchSlotsToAmapQueries("成都", blueprint.searchSlots);

  assert.ok(queries.length >= 3);
  assert.ok(queries.every((query) => query.city === "成都"));
  assert.ok(queries.some((query) => query.keywords.includes("小吃") || query.keywords.includes("美食")));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `route-blueprint.ts` does not exist.

- [ ] **Step 3: Implement route blueprint module**

Create `apps/web/src/domain/route-blueprint.ts`:

```ts
import { getRouteTheme } from "./theme-catalog";
import type { RouteCardRequest, RouteThemeId } from "./types";
import type { UserIntent } from "./user-intent";

export type SearchSlot = {
  id: string;
  day: 1 | 2;
  intent: string;
  query: string;
  tags: string[];
  limit: number;
};

export type RouteBlueprint = {
  summary: string;
  days: Array<{ day: 1 | 2; intent: string }>;
  searchSlots: SearchSlot[];
  constraints: string[];
};

export type BlueprintInput = Pick<RouteCardRequest, "city" | "themeId" | "durationDays" | "note"> & {
  intent: UserIntent;
};

export type AmapPoiQuery = {
  city: string;
  keywords: string;
  slotId: string;
  limit: number;
};

const themeKeywordMap: Record<RouteThemeId, string[]> = {
  classic: ["经典 景点", "文化 街区", "城市 地标"],
  easy_citywalk: ["步行 街区", "咖啡", "拍照 街区"],
  rain_backup: ["博物馆", "展览", "书店 咖啡"],
  food_linked: ["小吃", "美食", "本地 餐厅"],
  night_half_day: ["夜景", "夜市", "江景"],
  low_budget: ["免费 景点", "公园", "平价 美食"]
};

function intentKeywords(intent: UserIntent): string[] {
  const keywords: string[] = [];
  if (intent.interestWeights.photo >= 4) keywords.push("拍照");
  if (intent.interestWeights.food >= 4) keywords.push("小吃");
  if (intent.interestWeights.coffee >= 4) keywords.push("咖啡");
  if (intent.interestWeights.rainSafety >= 3) keywords.push("室内");
  if (intent.budgetPosture === "low") keywords.push("免费");
  return keywords;
}

export function buildFallbackBlueprint(input: BlueprintInput): RouteBlueprint {
  const theme = getRouteTheme(input.themeId);
  const days = input.durationDays === 2
    ? ([
        { day: 1 as const, intent: `${theme.label} opening day with low-friction anchors` },
        { day: 2 as const, intent: `${theme.label} slower second day with food or culture` }
      ])
    : [{ day: 1 as const, intent: `${theme.label} executable day route` }];

  const baseQueries = [...themeKeywordMap[input.themeId], ...intentKeywords(input.intent)];
  const uniqueQueries = Array.from(new Set(baseQueries));
  const searchSlots = uniqueQueries.map((query, index): SearchSlot => ({
    id: `slot-${index + 1}`,
    day: input.durationDays === 2 && index >= Math.ceil(uniqueQueries.length / 2) ? 2 : 1,
    intent: `${theme.id}:${query}`,
    query,
    tags: [...theme.primaryTags, ...theme.styleTags, query.includes("拍照") ? "photo" : ""].filter(Boolean),
    limit: 8
  }));

  return {
    summary: `${input.durationDays}日${theme.label}：${input.intent.intentSummary}`,
    days,
    searchSlots,
    constraints: ["single-day 3-4 main stops", "avoid unnecessary long transfers", "do not invent POIs"]
  };
}

export function searchSlotsToAmapQueries(city: string, slots: SearchSlot[]): AmapPoiQuery[] {
  return slots.map((slot) => ({
    city,
    keywords: slot.query,
    slotId: slot.id,
    limit: slot.limit
  }));
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit blueprint module**

Run:

```bash
git add apps/web/src/domain/route-blueprint.ts apps/web/src/domain/route-blueprint.test.ts
git commit -m "feat: build route blueprints for real planning"
```

Expected: Commit succeeds.

---

### Task 4: Add Amap Client Normalization

**Files:**
- Create: `apps/web/src/server/amap-client.ts`
- Create: `apps/web/src/server/amap-client.test.ts`

- [ ] **Step 1: Write failing Amap client tests**

Create `apps/web/src/server/amap-client.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { AmapClient, normalizeAmapPois } from "./amap-client";

const poiPayload = {
  status: "1",
  pois: [
    {
      id: "B0FFTEST01",
      name: "湖滨步行街",
      type: "购物服务;特色商业街;步行街",
      address: "湖滨路",
      location: "120.161421,30.255532",
      cityname: "杭州市"
    },
    {
      id: "B0FFTEST01",
      name: "湖滨步行街",
      type: "购物服务;特色商业街;步行街",
      address: "湖滨路",
      location: "120.161421,30.255532",
      cityname: "杭州市"
    }
  ]
};

test("normalizeAmapPois maps Amap POIs and deduplicates provider ids", () => {
  const pois = normalizeAmapPois(poiPayload, "杭州");

  assert.equal(pois.length, 1);
  assert.equal(pois[0].providerPoiId, "B0FFTEST01");
  assert.equal(pois[0].name, "湖滨步行街");
  assert.equal(pois[0].lng, 120.161421);
  assert.equal(pois[0].lat, 30.255532);
  assert.equal(pois[0].address, "湖滨路");
});

test("AmapClient.searchPois returns empty results without key", async () => {
  const client = new AmapClient({ key: "", fetcher: async () => new Response("{}") });

  const pois = await client.searchPois({ city: "杭州", keywords: "景点", slotId: "slot-1", limit: 5 });

  assert.deepEqual(pois, []);
});

test("AmapClient.estimateWalkingMinutes normalizes route duration seconds", async () => {
  const client = new AmapClient({
    key: "test-key",
    fetcher: async () => Response.json({ status: "1", route: { paths: [{ duration: "900" }] } })
  });

  const minutes = await client.estimateWalkingMinutes({ from: { lat: 30, lng: 120 }, to: { lat: 30.1, lng: 120.1 } });

  assert.equal(minutes, 15);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `amap-client.ts` does not exist.

- [ ] **Step 3: Implement Amap client**

Create `apps/web/src/server/amap-client.ts`:

```ts
import type { AmapPoiQuery } from "@/domain/route-blueprint";

export type RealPoiCandidate = {
  id: string;
  providerPoiId: string;
  name: string;
  city: string;
  address: string;
  providerType: string;
  lat: number;
  lng: number;
  tags: string[];
  sourceMode: "provider";
};

export type AmapClientOptions = {
  key?: string;
  fetcher?: typeof fetch;
};

export type WalkingEstimateInput = {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseLocation(location: string): { lat: number; lng: number } | null {
  const [lngRaw, latRaw] = location.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function tagsFromType(type: string): string[] {
  const tags: string[] = [];
  if (type.includes("风景") || type.includes("景点")) tags.push("landmark");
  if (type.includes("餐饮") || type.includes("小吃")) tags.push("local_food");
  if (type.includes("咖啡")) tags.push("coffee");
  if (type.includes("博物馆") || type.includes("文化")) tags.push("culture", "indoor");
  if (type.includes("购物")) tags.push("shopping");
  tags.push("walkable");
  return Array.from(new Set(tags));
}

export function normalizeAmapPois(payload: unknown, city: string): RealPoiCandidate[] {
  const rawPois = Array.isArray((payload as { pois?: unknown }).pois) ? (payload as { pois: unknown[] }).pois : [];
  const seen = new Set<string>();
  const results: RealPoiCandidate[] = [];

  for (const raw of rawPois) {
    const poi = raw as Record<string, unknown>;
    const providerPoiId = asString(poi.id);
    const name = asString(poi.name);
    const location = parseLocation(asString(poi.location));
    if (!providerPoiId || !name || !location || seen.has(providerPoiId)) continue;
    seen.add(providerPoiId);
    const providerType = asString(poi.type);
    results.push({
      id: providerPoiId,
      providerPoiId,
      name,
      city,
      address: asString(poi.address),
      providerType,
      lat: location.lat,
      lng: location.lng,
      tags: tagsFromType(providerType),
      sourceMode: "provider"
    });
  }

  return results;
}

export class AmapClient {
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AmapClientOptions = {}) {
    this.key = options.key || process.env.AMAP_WEB_SERVICE_KEY || "";
    this.fetcher = options.fetcher || fetch;
  }

  async searchPois(query: AmapPoiQuery): Promise<RealPoiCandidate[]> {
    if (!this.key) return [];
    const url = new URL("https://restapi.amap.com/v5/place/text");
    url.searchParams.set("key", this.key);
    url.searchParams.set("keywords", query.keywords);
    url.searchParams.set("region", query.city);
    url.searchParams.set("city_limit", "true");
    url.searchParams.set("page_size", String(query.limit));
    const response = await this.fetcher(url);
    if (!response.ok) return [];
    return normalizeAmapPois(await response.json(), query.city);
  }

  async estimateWalkingMinutes(input: WalkingEstimateInput): Promise<number | null> {
    if (!this.key) return null;
    const url = new URL("https://restapi.amap.com/v5/direction/walking");
    url.searchParams.set("key", this.key);
    url.searchParams.set("origin", `${input.from.lng},${input.from.lat}`);
    url.searchParams.set("destination", `${input.to.lng},${input.to.lat}`);
    const response = await this.fetcher(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const duration = Number((payload as { route?: { paths?: Array<{ duration?: string }> } }).route?.paths?.[0]?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return Math.max(1, Math.round(duration / 60));
  }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit Amap client**

Run:

```bash
git add apps/web/src/server/amap-client.ts apps/web/src/server/amap-client.test.ts
git commit -m "feat: add amap client normalization"
```

Expected: Commit succeeds.

---

### Task 5: Add Candidate Arrangement Validation And Rule Fallback

**Files:**
- Create: `apps/web/src/domain/route-arrangement.ts`
- Create: `apps/web/src/domain/route-arrangement.test.ts`

- [ ] **Step 1: Write failing arrangement tests**

Create `apps/web/src/domain/route-arrangement.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { arrangeCandidatesByRule, validateAiArrangement } from "./route-arrangement";
import type { RealPoiCandidate } from "@/server/amap-client";

const candidates: RealPoiCandidate[] = [
  { id: "a", providerPoiId: "a", name: "A", city: "杭州", address: "A路", providerType: "景点", lat: 30, lng: 120, tags: ["landmark", "photo"], sourceMode: "provider" },
  { id: "b", providerPoiId: "b", name: "B", city: "杭州", address: "B路", providerType: "餐饮", lat: 30.01, lng: 120.01, tags: ["local_food"], sourceMode: "provider" },
  { id: "c", providerPoiId: "c", name: "C", city: "杭州", address: "C路", providerType: "文化", lat: 30.02, lng: 120.02, tags: ["culture"], sourceMode: "provider" },
  { id: "d", providerPoiId: "d", name: "D", city: "杭州", address: "D路", providerType: "咖啡", lat: 30.03, lng: 120.03, tags: ["coffee"], sourceMode: "provider" }
];

test("validateAiArrangement rejects unknown candidate ids", () => {
  const result = validateAiArrangement(
    { selectedStops: [{ candidateId: "missing", day: 1, reason: "bad" }], arrangementReason: "x", skipSuggestion: "x", weatherAlternative: "x" },
    candidates,
    1,
  );

  assert.equal(result.ok, false);
});

test("validateAiArrangement rejects duplicate candidate ids", () => {
  const result = validateAiArrangement(
    { selectedStops: [{ candidateId: "a", day: 1, reason: "x" }, { candidateId: "a", day: 1, reason: "x" }], arrangementReason: "x", skipSuggestion: "x", weatherAlternative: "x" },
    candidates,
    1,
  );

  assert.equal(result.ok, false);
});

test("arrangeCandidatesByRule returns day assignments and user-facing explanations", () => {
  const arrangement = arrangeCandidatesByRule(candidates, 2);

  assert.equal(arrangement.selectedStops.length, 4);
  assert.ok(arrangement.selectedStops.some((stop) => stop.day === 1));
  assert.ok(arrangement.selectedStops.some((stop) => stop.day === 2));
  assert.match(arrangement.arrangementReason, /真实地点|可走/);
  assert.ok(arrangement.skipSuggestion);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `route-arrangement.ts` does not exist.

- [ ] **Step 3: Implement arrangement module**

Create `apps/web/src/domain/route-arrangement.ts`:

```ts
import type { RealPoiCandidate } from "@/server/amap-client";

export type AiSelectedStop = {
  candidateId: string;
  day: 1 | 2;
  reason: string;
};

export type AiRouteArrangement = {
  selectedStops: AiSelectedStop[];
  arrangementReason: string;
  skipSuggestion: string;
  weatherAlternative: string;
};

export type ArrangementValidationResult =
  | { ok: true; arrangement: AiRouteArrangement }
  | { ok: false; reason: string };

function maxStops(durationDays: 1 | 2): number {
  return durationDays === 2 ? 8 : 4;
}

export function validateAiArrangement(raw: unknown, candidates: RealPoiCandidate[], durationDays: 1 | 2): ArrangementValidationResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "arrangement_not_object" };
  const arrangement = raw as Partial<AiRouteArrangement>;
  if (!Array.isArray(arrangement.selectedStops)) return { ok: false, reason: "selected_stops_missing" };
  if (arrangement.selectedStops.length < 3 || arrangement.selectedStops.length > maxStops(durationDays)) return { ok: false, reason: "invalid_stop_count" };

  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  for (const stop of arrangement.selectedStops) {
    if (!allowed.has(stop.candidateId)) return { ok: false, reason: "unknown_candidate_id" };
    if (seen.has(stop.candidateId)) return { ok: false, reason: "duplicate_candidate_id" };
    seen.add(stop.candidateId);
    if (stop.day !== 1 && stop.day !== 2) return { ok: false, reason: "invalid_day" };
    if (durationDays === 1 && stop.day !== 1) return { ok: false, reason: "day_two_in_one_day_route" };
  }
  if (durationDays === 2 && !arrangement.selectedStops.some((stop) => stop.day === 2)) return { ok: false, reason: "missing_day_two" };

  return {
    ok: true,
    arrangement: {
      selectedStops: arrangement.selectedStops,
      arrangementReason: arrangement.arrangementReason || "已从真实候选地点中选择更顺路的一组。",
      skipSuggestion: arrangement.skipSuggestion || "如果体力不够，优先跳过中间停留时间最短的一站。",
      weatherAlternative: arrangement.weatherAlternative || "天气变化时优先保留室内或交通更方便的点。"
    }
  };
}

export function arrangeCandidatesByRule(candidates: RealPoiCandidate[], durationDays: 1 | 2): AiRouteArrangement {
  const limit = Math.min(maxStops(durationDays), Math.max(3, candidates.length));
  const selected = candidates.slice(0, limit);
  const splitIndex = durationDays === 2 ? Math.ceil(selected.length / 2) : selected.length;

  return {
    selectedStops: selected.map((candidate, index) => ({
      candidateId: candidate.id,
      day: durationDays === 2 && index >= splitIndex ? 2 : 1,
      reason: `${candidate.name} 来自真实地图候选，适合作为当前路线的一站。`
    })),
    arrangementReason: "已从真实地点中按可走性和主题相关性生成路线顺序。",
    skipSuggestion: selected[1] ? `如果太累，可以跳过 ${selected[1].name}，保留主线节奏。` : "如果太累，可以减少中间停留。",
    weatherAlternative: selected.find((candidate) => candidate.tags.includes("indoor"))
      ? `天气变化时优先保留 ${selected.find((candidate) => candidate.tags.includes("indoor"))?.name}。`
      : "天气变化时建议优先选择室内候选或缩短户外停留。"
  };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit arrangement module**

Run:

```bash
git add apps/web/src/domain/route-arrangement.ts apps/web/src/domain/route-arrangement.test.ts
git commit -m "feat: validate real route arrangements"
```

Expected: Commit succeeds.

---

### Task 6: Add OpenAI Structured Route Client

**Files:**
- Create: `apps/web/src/server/openai-route-client.ts`
- Create: `apps/web/src/server/openai-route-client.test.ts`

- [ ] **Step 1: Write failing OpenAI client tests**

Create `apps/web/src/server/openai-route-client.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiRouteClient, parseStructuredOutputText } from "./openai-route-client";

test("parseStructuredOutputText parses Responses API output text", () => {
  const payload = {
    output: [
      { content: [{ type: "output_text", text: "{\"summary\":\"轻松拍照\"}" }] }
    ]
  };

  assert.deepEqual(parseStructuredOutputText<{ summary: string }>(payload), { summary: "轻松拍照" });
});

test("OpenAiRouteClient returns null without API key", async () => {
  const client = new OpenAiRouteClient({ apiKey: "", fetcher: async () => Response.json({}) });

  const result = await client.createJson("system", "user", { type: "object", additionalProperties: true });

  assert.equal(result, null);
});

test("OpenAiRouteClient posts structured output request", async () => {
  let requestBody = "";
  const client = new OpenAiRouteClient({
    apiKey: "test-key",
    model: "test-model",
    fetcher: async (_url, init) => {
      requestBody = String(init?.body || "");
      return Response.json({ output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }] });
    }
  });

  const result = await client.createJson<{ ok: boolean }>("system", "user", { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false });

  assert.deepEqual(result, { ok: true });
  assert.match(requestBody, /test-model/);
  assert.match(requestBody, /json_schema/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `openai-route-client.ts` does not exist.

- [ ] **Step 3: Implement OpenAI route client**

Create `apps/web/src/server/openai-route-client.ts`:

```ts
export type OpenAiRouteClientOptions = {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
};

export type JsonSchema = Record<string, unknown>;

export function parseStructuredOutputText<T>(payload: unknown): T | null {
  const output = (payload as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        try {
          return JSON.parse(content.text) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export class OpenAiRouteClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiRouteClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    this.fetcher = options.fetcher || fetch;
  }

  async createJson<T>(systemPrompt: string, userPrompt: string, schema: JsonSchema): Promise<T | null> {
    if (!this.apiKey) return null;
    const response = await this.fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "route_planning_result",
            schema,
            strict: false
          }
        }
      })
    });
    if (!response.ok) return null;
    return parseStructuredOutputText<T>(await response.json());
  }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit OpenAI client**

Run:

```bash
git add apps/web/src/server/openai-route-client.ts apps/web/src/server/openai-route-client.test.ts
git commit -m "feat: add openai structured route client"
```

Expected: Commit succeeds.

---

### Task 7: Orchestrate Real Route Planner With Fallbacks

**Files:**
- Create: `apps/web/src/domain/real-route-planner.ts`
- Create: `apps/web/src/domain/real-route-planner.test.ts`
- Modify: `apps/web/app/api/route-cards/generate/route.ts`

- [ ] **Step 1: Write failing real planner tests**

Create `apps/web/src/domain/real-route-planner.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { generateRealRouteCard } from "./real-route-planner";
import type { RealPoiCandidate } from "@/server/amap-client";

const realCandidates: RealPoiCandidate[] = [
  { id: "a", providerPoiId: "a", name: "湖滨步行街", city: "杭州", address: "湖滨路", providerType: "街区", lat: 30, lng: 120, tags: ["photo", "walkable"], sourceMode: "provider" },
  { id: "b", providerPoiId: "b", name: "南宋御街小吃", city: "杭州", address: "中山中路", providerType: "餐饮", lat: 30.01, lng: 120.01, tags: ["local_food"], sourceMode: "provider" },
  { id: "c", providerPoiId: "c", name: "城市阳台", city: "杭州", address: "之江路", providerType: "景点", lat: 30.02, lng: 120.02, tags: ["landmark"], sourceMode: "provider" },
  { id: "d", providerPoiId: "d", name: "室内展馆", city: "杭州", address: "展馆路", providerType: "文化", lat: 30.03, lng: 120.03, tags: ["culture", "indoor"], sourceMode: "provider" }
];

const request = { city: "杭州", themeId: "classic" as const, startDate: "2026-05-10", durationDays: 1 as const, note: "想拍照，别太累" };

test("generateRealRouteCard falls back to local seed planner when Amap has no candidates", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => [], estimateWalkingMinutes: async () => null }
  });

  assert.equal(card.planningMode, "fallback_seed");
  assert.equal(card.degraded, true);
});

test("generateRealRouteCard uses Amap rule planning when real candidates exist without OpenAI", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 12 }
  });

  assert.equal(card.planningMode, "rule_amap");
  assert.equal(card.sourceMode, "provider");
  assert.equal(card.stops[0].sourceMode, "provider");
  assert.ok(card.stops[0].address);
  assert.ok(card.arrangementReason);
});

test("generateRealRouteCard accepts valid AI arrangement over candidates", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    openAiClient: {
      createJson: async () => ({
        selectedStops: [
          { candidateId: "b", day: 1, reason: "先吃点东西，降低决策成本。" },
          { candidateId: "a", day: 1, reason: "适合拍照和轻松散步。" },
          { candidateId: "c", day: 1, reason: "作为视野开阔的收束点。" }
        ],
        arrangementReason: "按吃饭、散步、收束排列。",
        skipSuggestion: "太累就跳过城市阳台。",
        weatherAlternative: "下雨优先替换到室内展馆。"
      })
    }
  });

  assert.equal(card.planningMode, "ai_amap");
  assert.equal(card.stops[0].poi, "南宋御街小吃");
  assert.equal(card.skipSuggestion, "太累就跳过城市阳台。");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `real-route-planner.ts` does not exist.

- [ ] **Step 3: Implement real route planner**

Create `apps/web/src/domain/real-route-planner.ts`:

```ts
import { randomUUID } from "node:crypto";
import { AmapClient, type RealPoiCandidate } from "@/server/amap-client";
import { OpenAiRouteClient } from "@/server/openai-route-client";
import { arrangeCandidatesByRule, validateAiArrangement, type AiRouteArrangement } from "./route-arrangement";
import { buildFallbackBlueprint, searchSlotsToAmapQueries } from "./route-blueprint";
import { getRouteTheme } from "./theme-catalog";
import type { RouteCard, RouteCardRequest, RouteLeg, RouteStop } from "./types";
import { inferUserIntent } from "./user-intent";
import { generateRouteCard } from "./planner";

const stopTimes = ["10:00", "12:20", "15:00", "19:30", "10:00", "12:20", "15:30", "19:30"];

type PlannerAmapClient = Pick<AmapClient, "searchPois" | "estimateWalkingMinutes">;
type PlannerOpenAiClient = Pick<OpenAiRouteClient, "createJson">;

export type RealRoutePlannerDeps = {
  amapClient?: PlannerAmapClient;
  openAiClient?: PlannerOpenAiClient;
};

function dedupeCandidates(candidates: RealPoiCandidate[]): RealPoiCandidate[] {
  const seen = new Set<string>();
  const results: RealPoiCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    results.push(candidate);
  }
  return results;
}

function mapUrlFor(candidate: RealPoiCandidate): string {
  return `https://uri.amap.com/marker?position=${candidate.lng},${candidate.lat}&name=${encodeURIComponent(candidate.name)}`;
}

async function buildLegs(stops: RouteStop[], amapClient: PlannerAmapClient): Promise<RouteLeg[]> {
  const legs: RouteLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const minutes = await amapClient.estimateWalkingMinutes({
      from: { lat: stops[index - 1].lat, lng: stops[index - 1].lng },
      to: { lat: stops[index].lat, lng: stops[index].lng }
    });
    legs.push({
      fromPoi: stops[index - 1].poi,
      toPoi: stops[index].poi,
      minutes: minutes || 18,
      degraded: !minutes,
      sourceMode: minutes ? "provider" : "mixed"
    });
  }
  return legs;
}

function buildStopsFromArrangement(candidates: RealPoiCandidate[], arrangement: AiRouteArrangement): RouteStop[] {
  const selectedById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return arrangement.selectedStops.map((selected, index) => {
    const candidate = selectedById.get(selected.candidateId);
    if (!candidate) throw new Error(`Missing candidate ${selected.candidateId}`);
    return {
      id: `${index + 1}-${candidate.id}`,
      time: stopTimes[index] || `${10 + index * 2}:00`,
      poiId: candidate.id,
      providerPoiId: candidate.providerPoiId,
      poi: candidate.name,
      tags: candidate.tags,
      lat: candidate.lat,
      lng: candidate.lng,
      address: candidate.address,
      providerType: candidate.providerType,
      day: selected.day,
      mapUrl: mapUrlFor(candidate),
      reason: selected.reason,
      risk: candidate.tags.includes("indoor") ? "室内点位，天气风险较低。" : "出发前建议确认天气和现场开放状态。",
      sourceMode: "provider"
    };
  });
}

function assembleCard(request: RouteCardRequest, stops: RouteStop[], arrangement: AiRouteArrangement, mode: "ai_amap" | "rule_amap", intentSummary: string, blueprintSummary: string, legs: RouteLeg[]): RouteCard {
  const theme = getRouteTheme(request.themeId);
  const totalTransit = legs.reduce((sum, leg) => sum + leg.minutes, 0);
  const providerWarnings = ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"];
  if (legs.some((leg) => leg.degraded)) providerWarnings.push("部分路程时间为估算，实际以地图导航为准。");

  return {
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
}

async function maybeAiArrangement(openAiClient: PlannerOpenAiClient | undefined, request: RouteCardRequest, candidates: RealPoiCandidate[], blueprintSummary: string): Promise<AiRouteArrangement | null> {
  if (!openAiClient) return null;
  const raw = await openAiClient.createJson<unknown>(
    "You arrange travel routes. Only choose candidateId values from the provided candidates. Do not invent POIs.",
    JSON.stringify({ request, blueprintSummary, candidates: candidates.map(({ id, name, address, tags }) => ({ id, name, address, tags })) }),
    {
      type: "object",
      properties: {
        selectedStops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidateId: { type: "string" },
              day: { type: "number" },
              reason: { type: "string" }
            },
            required: ["candidateId", "day", "reason"],
            additionalProperties: false
          }
        },
        arrangementReason: { type: "string" },
        skipSuggestion: { type: "string" },
        weatherAlternative: { type: "string" }
      },
      required: ["selectedStops", "arrangementReason", "skipSuggestion", "weatherAlternative"],
      additionalProperties: false
    },
  );
  const validation = validateAiArrangement(raw, candidates, request.durationDays);
  return validation.ok ? validation.arrangement : null;
}

export async function generateRealRouteCard(request: RouteCardRequest, deps: RealRoutePlannerDeps = {}): Promise<RouteCard> {
  const amapClient = deps.amapClient || new AmapClient();
  const openAiClient = deps.openAiClient || (process.env.OPENAI_API_KEY ? new OpenAiRouteClient() : undefined);
  const intent = inferUserIntent({ themeId: request.themeId, note: request.note });
  const blueprint = buildFallbackBlueprint({ ...request, intent });
  const queries = searchSlotsToAmapQueries(request.city, blueprint.searchSlots);
  const candidates = dedupeCandidates((await Promise.all(queries.map((query) => amapClient.searchPois(query)))).flat());

  if (candidates.length < 3) {
    const fallback = generateRouteCard(request);
    return {
      ...fallback,
      planningMode: "fallback_seed",
      degraded: true,
      degradedReason: "amap_candidate_supply_missing",
      sourceLabel: "本地示例数据",
      providerWarnings: ["当前使用本地示例数据，适合体验产品流程；出发前请核对真实地点。"]
    };
  }

  const aiArrangement = await maybeAiArrangement(openAiClient, request, candidates, blueprint.summary);
  const arrangement = aiArrangement || arrangeCandidatesByRule(candidates, request.durationDays);
  const mode = aiArrangement ? "ai_amap" : "rule_amap";
  const stops = buildStopsFromArrangement(candidates, arrangement);
  const legs = await buildLegs(stops, amapClient);

  return assembleCard(request, stops, arrangement, mode, intent.intentSummary, blueprint.summary, legs);
}
```

- [ ] **Step 4: Update generate API to use real planner**

Modify `apps/web/app/api/route-cards/generate/route.ts`:

```ts
import { generateRealRouteCard } from "@/domain/real-route-planner";
```

Replace:

```ts
  return jsonOk({ routeCard: generateRouteCard(body) });
```

with:

```ts
  return jsonOk({ routeCard: await generateRealRouteCard(body) });
```

Remove the old `generateRouteCard` import.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
cd apps/web
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit real planner orchestration**

Run:

```bash
git add apps/web/src/domain/real-route-planner.ts apps/web/src/domain/real-route-planner.test.ts apps/web/app/api/route-cards/generate/route.ts
git commit -m "feat: orchestrate real route planning fallbacks"
```

Expected: Commit succeeds.

---

### Task 8: Display Real Planning Explanations In Route Card

**Files:**
- Modify: `apps/web/src/components/RouteCard.tsx`
- Create: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add failing RouteCard rendering test**

Create `apps/web/src/components/RouteCard.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteCard } from "./RouteCard";
import type { RouteCard as RouteCardData } from "@/domain/types";

const routeCard: RouteCardData = {
  id: "card-1",
  city: "杭州",
  themeId: "classic",
  themeLabel: "经典初游路线",
  title: "杭州1日经典初游路线",
  summary: "真实路线",
  highlights: ["湖滨步行街 是路线主节点"],
  fitFor: "适合轻松拍照用户。",
  riskTips: ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"],
  sourceLabel: "Amap real map data + AI planning",
  planningMode: "ai_amap",
  intentSummary: "轻松拍照",
  blueprintSummary: "水岸与街区串联",
  arrangementReason: "先散步再收束，减少绕路。",
  skipSuggestion: "太累就跳过第二站。",
  weatherAlternative: "下雨改去室内展馆。",
  providerWarnings: ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"],
  startDate: "2026-05-10",
  durationDays: 1,
  estimatedCostCny: 240,
  stops: [
    { id: "1-a", time: "10:00", poiId: "a", poi: "湖滨步行街", address: "湖滨路", day: 1, tags: ["photo"], lat: 30, lng: 120, mapUrl: "https://uri.amap.com/marker", reason: "适合拍照。", risk: "出发前确认。", sourceMode: "provider" }
  ],
  legs: [],
  confidence: 0.86,
  confidenceTier: "high",
  degraded: false,
  degradedReason: "",
  sourceMode: "provider",
  share: { posterTitle: "杭州", posterSubtitle: "湖滨步行街", storyTitle: "故事", storyCaption: "1 个点位" },
  createdAt: "2026-05-05T00:00:00.000Z"
};

test("RouteCard renders real planning explanation fields", () => {
  const markup = renderToStaticMarkup(React.createElement(RouteCard, { routeCard }));

  assert.match(markup, /路线构思/);
  assert.match(markup, /这样安排的原因/);
  assert.match(markup, /太累就跳过/);
  assert.match(markup, /天气变化备选/);
  assert.match(markup, /湖滨路/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because `RouteCard` does not render explanation labels yet.

- [ ] **Step 3: Update RouteCard UI**

Modify `apps/web/src/components/RouteCard.tsx`:

- In the chip row, add planning mode chip when present:

```tsx
{routeCard.planningMode ? <span className="chip chip-light">{routeCard.planningMode}</span> : null}
```

- In each timeline row below `<strong>{stop.poi}</strong>`, render address when present:

```tsx
{stop.address ? <small>{stop.address}</small> : null}
```

- After the route summary, render optional explanation panel:

```tsx
{routeCard.intentSummary || routeCard.arrangementReason || routeCard.skipSuggestion || routeCard.weatherAlternative ? (
  <div className="explain-panel">
    {routeCard.intentSummary ? <div><span>路线构思</span><p>{routeCard.intentSummary}</p></div> : null}
    {routeCard.arrangementReason ? <div><span>这样安排的原因</span><p>{routeCard.arrangementReason}</p></div> : null}
    {routeCard.skipSuggestion ? <div><span>太累就跳过</span><p>{routeCard.skipSuggestion}</p></div> : null}
    {routeCard.weatherAlternative ? <div><span>天气变化备选</span><p>{routeCard.weatherAlternative}</p></div> : null}
  </div>
) : null}
```

- In risk list, include `providerWarnings` after `riskTips` with a merged de-duplicated array:

```tsx
const riskItems = Array.from(new Set([...(routeCard.riskTips || []), ...(routeCard.providerWarnings || [])]));
```

Then map `riskItems` instead of `routeCard.riskTips`.

- [ ] **Step 4: Add CSS for explanation panel**

Add to `apps/web/app/globals.css` near `.route-meta` styles:

```css
.explain-panel {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.explain-panel div {
  border: 1px solid rgba(18, 107, 67, 0.12);
  border-radius: 18px;
  background: rgba(231, 255, 240, 0.58);
  padding: 12px;
}

.explain-panel span {
  display: block;
  color: var(--green);
  font-size: 12px;
  font-weight: 950;
}

.explain-panel p,
.timeline-row small {
  display: block;
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
```

- [ ] **Step 5: Run tests, typecheck, and build**

Run:

```bash
cd apps/web
npm test
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit RouteCard UI updates**

Run:

```bash
git add apps/web/src/components/RouteCard.tsx apps/web/src/components/RouteCard.test.ts apps/web/app/globals.css
git commit -m "feat: show real planning explanations"
```

Expected: Commit succeeds.

---

### Task 9: Update Product Docs And Full Verification

**Files:**
- Modify: `docs/product/citywalk-route-cards-api.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`

- [ ] **Step 1: Update API doc**

In `docs/product/citywalk-route-cards-api.md`, under `POST /api/route-cards/generate`, add:

```md
Generation mode is environment-driven:

- `AMAP_WEB_SERVICE_KEY` + `OPENAI_API_KEY`: uses AI intent/blueprint, Amap real POIs, AI candidate-only arrangement, and Amap walking time.
- `AMAP_WEB_SERVICE_KEY` only: uses Amap real POIs with deterministic rule arrangement.
- No provider keys or provider failure: falls back to local seed data.

Route cards may include `planningMode`, `intentSummary`, `blueprintSummary`, `arrangementReason`, `skipSuggestion`, `weatherAlternative`, and `providerWarnings`.
```

- [ ] **Step 2: Update architecture doc**

In `docs/product/citywalk-route-cards-architecture.md`, replace the Provider Boundary section with:

```md
## Provider And AI Boundary

The real planner is server-side only.

1. `user-intent` structures user preference from theme and note.
2. `route-blueprint` turns intent into abstract search slots.
3. `amap-client` resolves slots into real POI candidates and walking times.
4. `openai-route-client` asks OpenAI for structured JSON only.
5. `route-arrangement` validates that AI selected only candidate IDs from Amap.
6. `real-route-planner` assembles a route card or falls back to the local seed planner.

OpenAI is never allowed to invent POI facts. Amap coordinates, addresses, and provider IDs remain the source of truth.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
bash scripts/dev.sh verify
```

Expected: PASS.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/product/citywalk-route-cards-api.md docs/product/citywalk-route-cards-architecture.md
git commit -m "docs: document real route planning modes"
```

Expected: Commit succeeds.

---

## Final Handoff

- Run `git status --short`; expected clean.
- Merge `codex/real-ai-amap-route-planning` back to `main`.
- Run `bash scripts/dev.sh verify` on `main`.
- Restart `apps/web` on `http://localhost:3000`.
- Manual smoke checks:
  - Generate with no provider keys; expect fallback seed mode and no crash.
  - If keys are configured, generate and confirm `planningMode` shows real provider modes.
