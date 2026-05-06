# Real Evidence Itinerary Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next AI Trip vertical slice: light trip creation, honest generation progress, Amap-grounded route planning, Exa-backed public evidence, day itinerary workbench, explicit navigation, point edits, and within-day drag sorting.

**Architecture:** Keep the existing Next.js full-stack app and the existing `generateRealRouteCard` orchestration. Add small typed boundaries around trip preferences and web evidence, then evolve the current `RoutePlannerApp`, `RouteCard`, and `RouteInteractiveMap` into a planning workbench without replacing the app shell. Amap remains the fact source, Exa becomes optional evidence enrichment, and AI remains candidate-only route arrangement.

**Tech Stack:** Next.js App Router, TypeScript, React, Node test runner, Amap Web Service, Amap JSAPI, Exa Search API, existing AI provider adapters, SQLite route-card persistence.

---

## Scope Check

This plan covers one vertical product slice. It intentionally includes both data and UI because the value only appears when users can see evidence and edit the generated itinerary.

Excluded from this plan:

- OCR, screenshot capture, and camera capture.
- Official Xiaohongshu integration.
- Backend streaming progress.
- Multi-route A/B/C versions.
- Social sharing improvements.
- Cross-day drag moving.
- In-app turn-by-turn navigation.

## File Structure

Create:

- `apps/web/src/server/web-evidence-provider.ts`: provider-neutral web evidence interface, null provider, Exa provider, and Exa normalization.
- `apps/web/src/server/web-evidence-provider.test.ts`: no-key, Exa normalization, failed-response, and provider selection tests.
- `apps/web/src/domain/itinerary-days.ts`: pure helpers for day tabs, stop filtering, and within-day reordering.
- `apps/web/src/domain/itinerary-days.test.ts`: helper tests for overview/day filtering and drag reorder.

Modify:

- `apps/web/src/domain/types.ts`: add trip preference request fields and evidence fields on route cards.
- `apps/web/src/domain/user-intent.ts`: read preference chips, imported text, companion, and transport preferences.
- `apps/web/src/domain/user-intent.test.ts`: cover chips and smart import text.
- `apps/web/src/domain/route-blueprint.ts`: include imported places/preferences in search slots without hard-coding fake POIs.
- `apps/web/src/domain/route-blueprint.test.ts`: cover imported text and preference chips.
- `apps/web/src/domain/real-route-planner.ts`: call web evidence provider, pass evidence into AI prompt, attach evidence to route cards, and degrade cleanly.
- `apps/web/src/domain/real-route-planner.test.ts`: cover evidence attachment, Exa failure, and candidate-only safety.
- `apps/web/app/api/route-cards/generate/route.ts`: parse new lightweight request fields.
- `apps/web/app/api/route-cards/generate/route.test.ts`: cover new request payload.
- `apps/web/src/domain/route-revision.ts`: preserve request preferences where possible and use structured edit notes.
- `apps/web/src/components/RoutePlannerApp.tsx`: add home-like creation entry, chips, smart import textarea, generation stages, and workbench action handlers.
- `apps/web/src/components/RoutePlannerApp.test.ts`: cover light entry, chips, smart import, and honest progress copy.
- `apps/web/src/components/RouteCard.tsx`: add tabs, day itinerary cards, evidence display, drag reorder state, and edit callback props.
- `apps/web/src/components/RouteCard.test.ts`: cover day tabs, evidence, explicit navigation, and revalidation state.
- `apps/web/src/components/RouteInteractiveMap.tsx`: add stop edit actions and explicit navigation menu in selected-stop details.
- `apps/web/src/components/RouteInteractiveMap.test.tsx`: cover edit buttons and explicit Amap navigation.
- `apps/web/app/globals.css`: style the planner shell, chips, generation progress, day tabs, itinerary cards, evidence panel, and stop action buttons.
- `.env.example`: add Exa search variables.
- `README.md`: fix root `.env` instructions and mention optional Exa.
- `docs/product/citywalk-route-cards-api.md`: document request fields and evidence response fields.
- `docs/product/citywalk-route-cards-architecture.md`: document the web evidence provider boundary.

---

## Task 1: Extend Route Request Types And API Parsing

**Files:**

- Modify: `apps/web/src/domain/types.ts`
- Modify: `apps/web/app/api/route-cards/generate/route.ts`
- Modify: `apps/web/app/api/route-cards/generate/route.test.ts`

- [ ] **Step 1: Write the failing API parsing test**

Update the import in `apps/web/app/api/route-cards/generate/route.test.ts`:

```ts
import { POST, asRequestBody } from "./route";
```

Add this test to the same file:

```ts
test("asRequestBody preserves lightweight trip planning fields", () => {
  const body = asRequestBody({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 2,
    note: "想轻松一点，有江景",
    tripPreferences: ["citywalk", "拍照出片", "少走路", "未知偏好"],
    importedText: "朋友推荐：湖滨步行街、南宋御街、城市阳台",
    startPoint: "杭州东站",
    endPoint: "湖滨银泰",
    transportPreference: "walk_first",
    companion: "friends"
  });

  assert.deepEqual(body, {
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 2,
    note: "想轻松一点，有江景",
    tripPreferences: ["citywalk", "拍照出片", "少走路"],
    importedText: "朋友推荐：湖滨步行街、南宋御街、城市阳台",
    startPoint: "杭州东站",
    endPoint: "湖滨银泰",
    transportPreference: "walk_first",
    companion: "friends"
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test app/api/route-cards/generate/route.test.ts
```

Expected: the new test fails because `asRequestBody` is not exported and the API parser does not preserve the new fields.

- [ ] **Step 3: Extend `RouteCardRequest`**

In `apps/web/src/domain/types.ts`, replace the current `RouteCardRequest` type with:

```ts
export type TripPreferenceId =
  | "经典必玩"
  | "吃喝逛"
  | "亲子"
  | "citywalk"
  | "历史古迹"
  | "小众探索"
  | "拍照出片"
  | "自然风光"
  | "文艺展览"
  | "室内备选"
  | "少走路"
  | "预算友好";

export type TransportPreference = "walk_first" | "public_transit_ok" | "taxi_ok";

export type CompanionType = "solo" | "friends" | "couple" | "family" | "elderly";

export type RouteCardRequest = {
  city: string;
  themeId: RouteThemeId;
  startDate: string;
  durationDays: 1 | 2;
  note: string;
  tripPreferences?: TripPreferenceId[];
  importedText?: string;
  startPoint?: string;
  endPoint?: string;
  transportPreference?: TransportPreference;
  companion?: CompanionType;
};
```

- [ ] **Step 4: Add parsing helpers in the generate route**

In `apps/web/app/api/route-cards/generate/route.ts`, update the imports:

```ts
import type { CompanionType, RouteCardRequest, TransportPreference, TripPreferenceId } from "@/domain/types";
```

Add these helpers above `asRequestBody`:

```ts
const allowedTripPreferences = new Set<TripPreferenceId>([
  "经典必玩",
  "吃喝逛",
  "亲子",
  "citywalk",
  "历史古迹",
  "小众探索",
  "拍照出片",
  "自然风光",
  "文艺展览",
  "室内备选",
  "少走路",
  "预算友好"
]);

const allowedTransportPreferences = new Set<TransportPreference>(["walk_first", "public_transit_ok", "taxi_ok"]);
const allowedCompanions = new Set<CompanionType>(["solo", "friends", "couple", "family", "elderly"]);

function asString(value: unknown): string {
  return String(value || "").trim();
}

function asTripPreferences(value: unknown): TripPreferenceId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const preferences = value.map((item) => String(item).trim()).filter((item): item is TripPreferenceId => allowedTripPreferences.has(item as TripPreferenceId));
  return preferences.length ? Array.from(new Set(preferences)) : undefined;
}

function asTransportPreference(value: unknown): TransportPreference | undefined {
  const raw = String(value || "").trim();
  return allowedTransportPreferences.has(raw as TransportPreference) ? (raw as TransportPreference) : undefined;
}

function asCompanion(value: unknown): CompanionType | undefined {
  const raw = String(value || "").trim();
  return allowedCompanions.has(raw as CompanionType) ? (raw as CompanionType) : undefined;
}
```

Export the parser so the test can assert the normalized request directly:

```ts
export function asRequestBody(value: unknown): RouteCardRequest | null {
```

Then replace the body extraction inside `asRequestBody` with:

```ts
  const city = asString(body.city);
  const themeId = asString(body.themeId);
  const startDate = asString(body.startDate);
  const durationDays = Number(body.durationDays || 1);
  const note = asString(body.note);
  const tripPreferences = asTripPreferences(body.tripPreferences);
  const importedText = asString(body.importedText);
  const startPoint = asString(body.startPoint);
  const endPoint = asString(body.endPoint);
  const transportPreference = asTransportPreference(body.transportPreference);
  const companion = asCompanion(body.companion);
```

Replace the return with:

```ts
  return {
    city,
    themeId,
    startDate,
    durationDays,
    note,
    ...(tripPreferences ? { tripPreferences } : {}),
    ...(importedText ? { importedText } : {}),
    ...(startPoint ? { startPoint } : {}),
    ...(endPoint ? { endPoint } : {}),
    ...(transportPreference ? { transportPreference } : {}),
    ...(companion ? { companion } : {})
  };
```

- [ ] **Step 5: Run the focused API test**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test app/api/route-cards/generate/route.test.ts
```

Expected: all tests in `route.test.ts` pass.

- [ ] **Step 6: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add apps/web/src/domain/types.ts apps/web/app/api/route-cards/generate/route.ts apps/web/app/api/route-cards/generate/route.test.ts
git commit -m "feat: accept lightweight trip planning fields"
```

---

## Task 2: Teach Intent And Blueprint About Chips And Import Text

**Files:**

- Modify: `apps/web/src/domain/user-intent.ts`
- Modify: `apps/web/src/domain/user-intent.test.ts`
- Modify: `apps/web/src/domain/route-blueprint.ts`
- Modify: `apps/web/src/domain/route-blueprint.test.ts`

- [ ] **Step 1: Write failing intent tests**

Add these tests to `apps/web/src/domain/user-intent.test.ts`:

```ts
test("inferUserIntent reads preference chips and imported text", () => {
  const intent = inferUserIntent({
    themeId: "classic",
    note: "不要太赶",
    tripPreferences: ["拍照出片", "吃喝逛", "少走路"],
    importedText: "朋友收藏了南宋御街和城市阳台",
    companion: "friends",
    transportPreference: "walk_first"
  });

  assert.equal(intent.travelerProfile, "friends");
  assert.equal(intent.physicalPace, "low_walking");
  assert.ok(intent.interestWeights.photo >= 4);
  assert.ok(intent.interestWeights.food >= 4);
  assert.ok(intent.mustHaveConstraints.includes("朋友收藏了南宋御街和城市阳台"));
  assert.ok(intent.avoidConstraints.includes("步行优先但避免连续长距离暴走"));
});

test("inferUserIntent maps family and elderly request fields", () => {
  const familyIntent = inferUserIntent({
    themeId: "easy_citywalk",
    note: "",
    tripPreferences: ["亲子", "室内备选"],
    companion: "family",
    transportPreference: "public_transit_ok"
  });

  assert.equal(familyIntent.travelerProfile, "kids");
  assert.ok(familyIntent.interestWeights.rainSafety >= 3);
  assert.ok(familyIntent.mustHaveConstraints.includes("适合亲子同行"));
  assert.ok(familyIntent.avoidConstraints.includes("优先公共交通可达"));
});
```

- [ ] **Step 2: Run the intent tests to verify failure**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/user-intent.test.ts
```

Expected: type errors or failing assertions because `IntentInput` only accepts `themeId` and `note`.

- [ ] **Step 3: Extend `IntentInput`**

In `apps/web/src/domain/user-intent.ts`, update the import:

```ts
import type { CompanionType, RouteThemeId, TransportPreference, TripPreferenceId } from "./types";
```

Replace `IntentInput` with:

```ts
export type IntentInput = {
  themeId: RouteThemeId;
  note: string;
  tripPreferences?: TripPreferenceId[];
  importedText?: string;
  companion?: CompanionType;
  transportPreference?: TransportPreference;
};
```

- [ ] **Step 4: Add preference and request-field logic**

In `inferUserIntent`, after `const weights = withThemeWeights(input.themeId);`, add:

```ts
  const preferences = input.tripPreferences || [];
  const importedText = (input.importedText || "").trim();
```

After the existing note keyword checks, add:

```ts
  if (preferences.includes("拍照出片")) weights.photo += 3;
  if (preferences.includes("吃喝逛")) weights.food += 3;
  if (preferences.includes("历史古迹") || preferences.includes("文艺展览")) weights.culture += 3;
  if (preferences.includes("自然风光")) weights.nature += 3;
  if (preferences.includes("室内备选")) rainSafe(weights);
  if (preferences.includes("预算友好")) weights.nature += 1;
  if (preferences.includes("小众探索")) weights.classic -= 0.5;
  if (preferences.includes("citywalk")) {
    weights.photo += 1;
    weights.coffee += 1;
  }
```

Replace the `travelerProfile` assignment with:

```ts
  const travelerProfile: TravelerProfile = input.companion === "elderly" || includesAny(note, ["爸妈", "父母", "老人"])
    ? "parents"
    : input.companion === "family" || preferences.includes("亲子") || includesAny(note, ["孩子", "小孩", "亲子"])
      ? "kids"
      : input.companion === "friends" || includesAny(note, ["朋友", "闺蜜", "同学"])
        ? "friends"
        : "unknown";
```

Replace the `physicalPace` assignment with:

```ts
  const physicalPace: PhysicalPace = preferences.includes("少走路") || includesAny(note, ["少走", "少走路"])
    ? "low_walking"
    : includesAny(note, ["轻松", "别太累", "不赶", "不要太赶"])
      ? "relaxed"
      : includesAny(note, ["多逛", "充实", "特种兵"])
        ? "packed"
        : input.themeId === "easy_citywalk"
          ? "relaxed"
          : "normal";
```

After the existing `avoidConstraints` population block, add:

```ts
  if (importedText) mustHaveConstraints.push(importedText.slice(0, 120));
  if (preferences.includes("亲子")) mustHaveConstraints.push("适合亲子同行");
  if (preferences.includes("室内备选")) mustHaveConstraints.push("保留室内备选");
  if (input.transportPreference === "walk_first") avoidConstraints.push("步行优先但避免连续长距离暴走");
  if (input.transportPreference === "public_transit_ok") avoidConstraints.push("优先公共交通可达");
  if (input.transportPreference === "taxi_ok") avoidConstraints.push("可用打车减少换乘");
```

- [ ] **Step 5: Run the intent tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/user-intent.test.ts
```

Expected: all intent tests pass.

- [ ] **Step 6: Write failing blueprint test**

Add this test to `apps/web/src/domain/route-blueprint.test.ts`:

```ts
test("buildFallbackBlueprint includes preference and imported text search hints without inventing fixed route stops", () => {
  const intent = inferUserIntent({
    themeId: "classic",
    note: "想轻松",
    tripPreferences: ["历史古迹", "吃喝逛"],
    importedText: "朋友推荐南宋御街和城市阳台"
  });
  const blueprint = buildFallbackBlueprint({
    city: "杭州",
    themeId: "classic",
    durationDays: 1,
    note: "想轻松",
    tripPreferences: ["历史古迹", "吃喝逛"],
    importedText: "朋友推荐南宋御街和城市阳台",
    intent
  });

  assert.ok(blueprint.searchSlots.some((slot) => slot.query.includes("历史")));
  assert.ok(blueprint.searchSlots.some((slot) => slot.query.includes("美食") || slot.query.includes("小吃")));
  assert.ok(blueprint.searchSlots.some((slot) => slot.query.includes("南宋御街")));
  assert.ok(blueprint.constraints.includes("imported places are search hints, not guaranteed stops"));
});
```

- [ ] **Step 7: Extend blueprint input and query hints**

In `apps/web/src/domain/route-blueprint.ts`, replace `BlueprintInput` with:

```ts
export type BlueprintInput = Pick<RouteCardRequest, "city" | "themeId" | "durationDays" | "note" | "tripPreferences" | "importedText" | "startPoint" | "endPoint" | "transportPreference" | "companion"> & {
  intent: UserIntent;
};
```

Add these helpers above `buildFallbackBlueprint`:

```ts
function preferenceKeywords(preferences: RouteCardRequest["tripPreferences"] = []): string[] {
  const keywords: string[] = [];
  if (preferences.includes("经典必玩")) keywords.push("经典 景点");
  if (preferences.includes("吃喝逛")) keywords.push("小吃", "本地 餐厅");
  if (preferences.includes("亲子")) keywords.push("亲子 适合");
  if (preferences.includes("citywalk")) keywords.push("步行 街区");
  if (preferences.includes("历史古迹")) keywords.push("历史 古迹");
  if (preferences.includes("小众探索")) keywords.push("小众 景点");
  if (preferences.includes("拍照出片")) keywords.push("拍照 出片");
  if (preferences.includes("自然风光")) keywords.push("自然 风景");
  if (preferences.includes("文艺展览")) keywords.push("展览 美术馆");
  if (preferences.includes("室内备选")) keywords.push("室内 展馆");
  if (preferences.includes("预算友好")) keywords.push("免费 景点");
  return keywords;
}

function importedTextKeywords(importedText?: string): string[] {
  const text = (importedText || "").trim();
  if (!text) return [];
  return text
    .split(/[，,、\n]/)
    .map((part) => part.replace(/朋友推荐|收藏了|推荐|想去/g, "").trim())
    .filter((part) => part.length >= 2)
    .slice(0, 4);
}
```

Replace:

```ts
  const baseQueries = [...themeKeywordMap[input.themeId], ...intentKeywords(input.intent)];
```

with:

```ts
  const baseQueries = [
    ...themeKeywordMap[input.themeId],
    ...intentKeywords(input.intent),
    ...preferenceKeywords(input.tripPreferences),
    ...importedTextKeywords(input.importedText)
  ];
```

Replace the `constraints` array with:

```ts
    constraints: [
      "single-day 3-4 main stops",
      "avoid unnecessary long transfers",
      "do not invent POIs",
      ...(input.importedText ? ["imported places are search hints, not guaranteed stops"] : []),
      ...(input.startPoint ? [`start near ${input.startPoint}`] : []),
      ...(input.endPoint ? [`end near ${input.endPoint}`] : [])
    ]
```

- [ ] **Step 8: Run blueprint and planner tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/user-intent.test.ts src/domain/route-blueprint.test.ts src/domain/real-route-planner.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add apps/web/src/domain/user-intent.ts apps/web/src/domain/user-intent.test.ts apps/web/src/domain/route-blueprint.ts apps/web/src/domain/route-blueprint.test.ts
git commit -m "feat: derive intent from trip preferences"
```

---

## Task 3: Add Exa Web Evidence Provider

**Files:**

- Create: `apps/web/src/server/web-evidence-provider.ts`
- Create: `apps/web/src/server/web-evidence-provider.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing evidence provider tests**

Create `apps/web/src/server/web-evidence-provider.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebEvidenceProvider,
  ExaWebEvidenceProvider,
  normalizeExaEvidence,
  NullWebEvidenceProvider
} from "./web-evidence-provider";

test("NullWebEvidenceProvider returns no evidence", async () => {
  const provider = new NullWebEvidenceProvider();
  const evidence = await provider.searchEvidence({ city: "杭州", query: "杭州 citywalk", stopNames: ["湖滨步行街"] });

  assert.deepEqual(evidence, []);
});

test("normalizeExaEvidence maps title url source and snippet", () => {
  const evidence = normalizeExaEvidence(
    {
      results: [
        {
          title: "杭州 citywalk 攻略",
          url: "https://example.com/hangzhou",
          summary: "湖滨适合拍照，南宋御街适合吃小吃。",
          highlights: ["湖滨适合拍照"],
          publishedDate: "2026-04-01T00:00:00.000Z"
        },
        {
          title: "",
          url: "",
          summary: "missing url"
        }
      ]
    },
    "context",
  );

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].title, "杭州 citywalk 攻略");
  assert.equal(evidence[0].url, "https://example.com/hangzhou");
  assert.equal(evidence[0].sourceName, "example.com");
  assert.equal(evidence[0].snippet, "湖滨适合拍照");
  assert.equal(evidence[0].usedFor, "context");
  assert.equal(evidence[0].publishedDate, "2026-04-01T00:00:00.000Z");
});

test("ExaWebEvidenceProvider calls Exa Search with x-api-key", async () => {
  const requested: { url?: string; headers?: Headers; body?: unknown } = {};
  const provider = new ExaWebEvidenceProvider({
    apiKey: "exa-test-key",
    fetcher: async (url, init) => {
      requested.url = String(url);
      requested.headers = new Headers(init?.headers);
      requested.body = JSON.parse(String(init?.body));
      return Response.json({
        results: [{ title: "攻略", url: "https://travel.example/1", highlights: ["需要预约"], summary: "预约提示" }]
      });
    }
  });

  const evidence = await provider.searchEvidence({ city: "杭州", query: "轻松拍照", stopNames: ["湖滨步行街"] });

  assert.equal(requested.url, "https://api.exa.ai/search");
  assert.equal(requested.headers?.get("x-api-key"), "exa-test-key");
  assert.deepEqual(requested.body, {
    query: "杭州 轻松拍照 湖滨步行街 旅行攻略 避坑 预约",
    type: "auto",
    numResults: 5,
    contents: { highlights: true, summary: true }
  });
  assert.equal(evidence.length, 1);
});

test("createWebEvidenceProvider returns Exa only when configured", () => {
  assert.ok(createWebEvidenceProvider({ SEARCH_PROVIDER: "exa", EXA_API_KEY: "key" }) instanceof ExaWebEvidenceProvider);
  assert.ok(createWebEvidenceProvider({ SEARCH_PROVIDER: "exa" }) instanceof NullWebEvidenceProvider);
  assert.ok(createWebEvidenceProvider({}) instanceof NullWebEvidenceProvider);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/server/web-evidence-provider.test.ts
```

Expected: fail because the provider file does not exist.

- [ ] **Step 3: Implement provider**

Create `apps/web/src/server/web-evidence-provider.ts`:

```ts
import type { EvidenceUseCase, StopEvidence } from "@/domain/types";

export type WebEvidenceRequest = {
  city: string;
  query: string;
  stopNames: string[];
};

export type WebEvidenceProvider = {
  searchEvidence(input: WebEvidenceRequest): Promise<StopEvidence[]>;
};

export type WebEvidenceProviderEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export class NullWebEvidenceProvider implements WebEvidenceProvider {
  async searchEvidence(): Promise<StopEvidence[]> {
    return [];
  }
}

export type ExaWebEvidenceProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sourceNameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function firstSnippet(result: Record<string, unknown>): string {
  const highlights = Array.isArray(result.highlights) ? result.highlights.map((item) => asString(item)).filter(Boolean) : [];
  return highlights[0] || asString(result.summary) || asString(result.text);
}

export function normalizeExaEvidence(payload: unknown, usedFor: EvidenceUseCase): StopEvidence[] {
  const results = Array.isArray((payload as { results?: unknown }).results) ? (payload as { results: unknown[] }).results : [];
  return results
    .map((raw): StopEvidence | null => {
      const result = raw as Record<string, unknown>;
      const title = asString(result.title);
      const url = asString(result.url);
      const snippet = firstSnippet(result).slice(0, 220);
      if (!title || !url || !snippet) return null;
      return {
        title,
        url,
        sourceName: sourceNameFor(url),
        snippet,
        usedFor,
        publishedDate: asString(result.publishedDate) || undefined
      };
    })
    .filter((item): item is StopEvidence => Boolean(item));
}

export class ExaWebEvidenceProvider implements WebEvidenceProvider {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ExaWebEvidenceProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.EXA_API_KEY || "";
    this.fetcher = options.fetcher || fetch;
  }

  async searchEvidence(input: WebEvidenceRequest): Promise<StopEvidence[]> {
    if (!this.apiKey) return [];
    const query = [input.city, input.query, ...input.stopNames.slice(0, 4), "旅行攻略", "避坑", "预约"].filter(Boolean).join(" ");
    const response = await this.fetcher("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 5,
        contents: { highlights: true, summary: true }
      })
    });
    if (!response.ok) return [];
    return normalizeExaEvidence(await response.json(), "context");
  }
}

export function createWebEvidenceProvider(env: WebEvidenceProviderEnv = process.env): WebEvidenceProvider {
  const provider = (env.SEARCH_PROVIDER || "").toLowerCase();
  if (provider === "exa" && env.EXA_API_KEY) return new ExaWebEvidenceProvider({ apiKey: env.EXA_API_KEY });
  return new NullWebEvidenceProvider();
}
```

- [ ] **Step 4: Add evidence types**

In `apps/web/src/domain/types.ts`, add these types above `RouteCard`:

```ts
export type EvidenceUseCase = "reason" | "risk" | "season" | "reservation" | "context";

export type StopEvidence = {
  stopId?: string;
  title: string;
  url: string;
  sourceName: string;
  snippet: string;
  usedFor: EvidenceUseCase;
  publishedDate?: string;
};
```

Add these fields to `RouteCard` near `providerWarnings?: string[];`:

```ts
  evidenceSummary?: string;
  evidenceSources?: StopEvidence[];
```

- [ ] **Step 5: Update environment example**

Append this block to `.env.example`:

```env
# Optional public web evidence provider. Use "exa" to enrich route reasons and risk notes.
SEARCH_PROVIDER=
EXA_API_KEY=
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/server/web-evidence-provider.test.ts src/domain/real-route-planner.test.ts src/components/RouteCard.test.ts
```

Expected: focused tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add .env.example apps/web/src/domain/types.ts apps/web/src/server/web-evidence-provider.ts apps/web/src/server/web-evidence-provider.test.ts
git commit -m "feat: add exa web evidence provider"
```

---

## Task 4: Attach Evidence To Real Route Planning

**Files:**

- Modify: `apps/web/src/domain/real-route-planner.ts`
- Modify: `apps/web/src/domain/real-route-planner.test.ts`

- [ ] **Step 1: Write failing planner evidence tests**

In `apps/web/src/domain/real-route-planner.test.ts`, update the imports:

```ts
import type { RealPoiCandidate } from "@/server/amap-client";
import type { WebEvidenceProvider } from "@/server/web-evidence-provider";
```

Add this helper below `request`:

```ts
const evidenceProvider: WebEvidenceProvider = {
  searchEvidence: async () => [
    {
      title: "杭州轻松 citywalk 攻略",
      url: "https://example.com/hangzhou-walk",
      sourceName: "example.com",
      snippet: "湖滨步行街适合拍照，南宋御街适合安排小吃。",
      usedFor: "context"
    }
  ]
};
```

Add these tests:

```ts
test("generateRealRouteCard attaches configured web evidence without changing Amap facts", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    evidenceProvider,
    openAiClient: {
      createJson: async <T,>() =>
        ({
          selectedStops: [
            { candidateId: "a", day: 1, reason: "湖滨步行街有公开攻略证据支持拍照。" },
            { candidateId: "b", day: 1, reason: "南宋御街适合作为餐食节点。" },
            { candidateId: "c", day: 1, reason: "城市阳台适合收束。" }
          ],
          arrangementReason: "结合地图候选和公开攻略证据排列。",
          skipSuggestion: "太累就跳过城市阳台。",
          weatherAlternative: "下雨改去室内展馆。"
        }) as T
    }
  });

  assert.equal(card.planningMode, "ai_amap");
  assert.equal(card.stops[0].address, "湖滨路");
  assert.equal(card.evidenceSources?.[0].sourceName, "example.com");
  assert.match(card.evidenceSummary || "", /公开攻略证据/);
  assert.match(card.sourceLabel, /web evidence/);
});

test("generateRealRouteCard continues when web evidence provider fails", async () => {
  const card = await generateRealRouteCard(request, {
    amapClient: { searchPois: async () => realCandidates, estimateWalkingMinutes: async () => 10 },
    evidenceProvider: {
      searchEvidence: async () => {
        throw new Error("exa unavailable");
      }
    }
  });

  assert.equal(card.sourceMode, "provider");
  assert.equal(card.evidenceSources?.length || 0, 0);
  assert.ok(card.providerWarnings?.some((warning) => warning.includes("公开攻略证据")));
});
```

- [ ] **Step 2: Run planner tests to verify failure**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/real-route-planner.test.ts
```

Expected: fail because `RealRoutePlannerDeps` has no `evidenceProvider`.

- [ ] **Step 3: Add evidence dependency and safe evidence search**

In `apps/web/src/domain/real-route-planner.ts`, add import:

```ts
import { createWebEvidenceProvider, type WebEvidenceProvider } from "@/server/web-evidence-provider";
```

Update `RealRoutePlannerDeps`:

```ts
export type RealRoutePlannerDeps = {
  amapClient?: PlannerAmapClient;
  aiClient?: PlannerAiClient;
  openAiClient?: PlannerAiClient;
  evidenceProvider?: WebEvidenceProvider;
};
```

Add this helper above `maybeAiArrangement`:

```ts
async function searchEvidenceSafely(
  provider: WebEvidenceProvider,
  request: RouteCardRequest,
  intentSummary: string,
  candidates: RealPoiCandidate[],
): Promise<{ evidenceSources: RouteCard["evidenceSources"]; warning?: string }> {
  try {
    const evidenceSources = await provider.searchEvidence({
      city: request.city,
      query: [request.note, intentSummary, request.tripPreferences?.join(" ")].filter(Boolean).join(" "),
      stopNames: candidates.slice(0, 6).map((candidate) => candidate.name)
    });
    return { evidenceSources };
  } catch {
    return { evidenceSources: [], warning: "未获取到公开攻略证据，已继续使用地图事实生成路线。" };
  }
}
```

- [ ] **Step 4: Pass evidence to AI prompt**

Change `maybeAiArrangement` signature to:

```ts
async function maybeAiArrangement(
  aiClient: PlannerAiClient | undefined,
  request: RouteCardRequest,
  candidates: RealPoiCandidate[],
  blueprintSummary: string,
  evidenceSources: RouteCard["evidenceSources"] = [],
): Promise<AiRouteArrangement | null> {
```

Replace the `JSON.stringify` user prompt payload with:

```ts
    JSON.stringify({
      request,
      blueprintSummary,
      candidates: candidates.map(({ id, name, address, tags }) => ({ id, name, address, tags })),
      webEvidence: evidenceSources.map(({ title, sourceName, snippet, usedFor }) => ({ title, sourceName, snippet, usedFor }))
    }),
```

- [ ] **Step 5: Attach evidence to assembled cards**

Change `assembleCard` signature to include:

```ts
  legs: RouteLeg[],
  evidenceSources: RouteCard["evidenceSources"] = [],
  evidenceWarning?: string,
```

Replace `providerWarnings` initialization with:

```ts
  const providerWarnings = ["地点来自地图服务，营业/预约/交通以出发前实时信息为准。"];
```

After the route-time warning, add:

```ts
  if (evidenceWarning) providerWarnings.push(evidenceWarning);
```

Change `sourceLabel` to:

```ts
    sourceLabel:
      mode === "ai_amap"
        ? `Amap real map data + AI planning${evidenceSources.length ? " + web evidence" : ""}`
        : `Amap real map data + rule planning${evidenceSources.length ? " + web evidence" : ""}`,
```

Add these fields before `providerWarnings`:

```ts
    evidenceSummary: evidenceSources.length ? `已参考 ${evidenceSources.length} 条公开攻略证据，用于推荐理由和风险提醒。` : undefined,
    evidenceSources,
```

- [ ] **Step 6: Wire evidence search in `generateRealRouteCard`**

Inside `generateRealRouteCard`, after candidates length check and before AI arrangement, add:

```ts
  const evidenceProvider = deps.evidenceProvider || createWebEvidenceProvider();
  const evidenceResult = await searchEvidenceSafely(evidenceProvider, request, intent.intentSummary, candidates);
```

Replace:

```ts
  const aiArrangement = await maybeAiArrangement(aiClient, request, candidates, blueprint.summary);
```

with:

```ts
  const aiArrangement = await maybeAiArrangement(aiClient, request, candidates, blueprint.summary, evidenceResult.evidenceSources);
```

Replace the final return call with:

```ts
  return assembleCard(
    request,
    stops,
    arrangement,
    mode,
    intent.intentSummary,
    blueprint.summary,
    legs,
    evidenceResult.evidenceSources,
    evidenceResult.warning,
  );
```

- [ ] **Step 7: Run planner tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/real-route-planner.test.ts src/server/web-evidence-provider.test.ts
```

Expected: focused tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add apps/web/src/domain/real-route-planner.ts apps/web/src/domain/real-route-planner.test.ts
git commit -m "feat: enrich route planning with web evidence"
```

---

## Task 5: Add Lightweight Creation Entry, Chips, Import, And Honest Progress

**Files:**

- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing UI tests**

Add these tests to `apps/web/src/components/RoutePlannerApp.test.ts`:

```ts
test("RoutePlannerApp exposes light create entries and planning chips", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /我的行程/);
  assert.match(markup, /创建新计划/);
  assert.match(markup, /智能导入地点\/行程/);
  assert.match(markup, /采集识别/);
  assert.match(markup, /拍照出片/);
  assert.match(markup, /历史古迹/);
  assert.match(markup, /预算友好/);
});

test("RoutePlannerApp renders honest generation progress labels", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /理解旅行需求/);
  assert.match(markup, /高德搜索真实地点/);
  assert.match(markup, /Exa 检索公开攻略证据/);
  assert.match(markup, /不展示未接入来源/);
  assert.doesNotMatch(markup, /正在搜索小红书官方/);
});
```

- [ ] **Step 2: Run component tests to verify failure**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/components/RoutePlannerApp.test.ts
```

Expected: fail because light create entries and progress copy are not rendered.

- [ ] **Step 3: Add preference state and progress constants**

In `apps/web/src/components/RoutePlannerApp.tsx`, update the type import:

```ts
import type { RouteCard as RouteCardData, SavedRouteCardSummary, TripPreferenceId } from "@/domain/types";
```

Add constants near `cityOptions`:

```ts
const preferenceOptions: TripPreferenceId[] = [
  "经典必玩",
  "吃喝逛",
  "亲子",
  "citywalk",
  "历史古迹",
  "小众探索",
  "拍照出片",
  "自然风光",
  "文艺展览",
  "室内备选",
  "少走路",
  "预算友好"
];

const generationStages = [
  "理解旅行需求",
  "构思路线骨架",
  "高德搜索真实地点",
  "Exa 检索公开攻略证据",
  "筛选候选点",
  "估算路上时间",
  "生成每日行程",
  "生成行前提醒"
];
```

Inside `RoutePlannerApp`, add state:

```ts
  const [activeCreateMode, setActiveCreateMode] = useState<"new" | "import">("new");
  const [tripPreferences, setTripPreferences] = useState<TripPreferenceId[]>(["拍照出片", "少走路"]);
  const [importedText, setImportedText] = useState("");
```

Add helper:

```ts
  function togglePreference(preference: TripPreferenceId) {
    setTripPreferences((current) =>
      current.includes(preference) ? current.filter((item) => item !== preference) : [...current, preference],
    );
  }
```

- [ ] **Step 4: Send new fields in generate request**

In `generate`, replace the request body with:

```ts
            body: JSON.stringify({
              city,
              themeId,
              startDate,
              durationDays,
              note,
              tripPreferences,
              importedText: activeCreateMode === "import" ? importedText : undefined
            })
```

Replace status before request with:

```ts
        setStatus("正在生成真实行程：理解需求、搜索地点、检索证据、校验路线。");
```

Replace success status with:

```ts
        setStatus("真实行程已生成，可以继续编辑点位或保存。");
```

- [ ] **Step 5: Render home entry, chips, import, and progress**

In the planner panel JSX, replace the existing eyebrow/heading/hero-copy block with:

```tsx
        <p className="eyebrow">AI Trip · 我的行程</p>
        <h1>把一句旅行想法变成可执行行程。</h1>
        <p className="hero-copy">轻入口、真实地点、公开攻略证据和 App 内地图工作台，优先帮你把旅行规划做好。</p>

        <div className="create-entry-panel">
          <div>
            <span>创建入口</span>
            <strong>我的行程</strong>
            <p>底部大加号的三个方向里，先实现创建新计划和智能导入。</p>
          </div>
          <div className="create-entry-actions">
            <button className={activeCreateMode === "new" ? "active" : ""} onClick={() => setActiveCreateMode("new")} type="button">
              创建新计划
            </button>
            <button className={activeCreateMode === "import" ? "active" : ""} onClick={() => setActiveCreateMode("import")} type="button">
              智能导入地点/行程
            </button>
            <button disabled type="button" title="采集识别不在本版范围内">
              采集识别
            </button>
          </div>
        </div>
```

After the theme grid, add:

```tsx
        <div className="preference-chip-panel">
          <span>旅行偏好</span>
          <div className="preference-chip-grid">
            {preferenceOptions.map((preference) => (
              <button
                className={tripPreferences.includes(preference) ? "preference-chip active" : "preference-chip"}
                key={preference}
                onClick={() => togglePreference(preference)}
                type="button"
              >
                {preference}
              </button>
            ))}
          </div>
        </div>

        {activeCreateMode === "import" ? (
          <label>
            智能导入内容
            <textarea
              placeholder="粘贴你收藏的地点、朋友发来的行程、攻略片段，例如：湖滨步行街、南宋御街、城市阳台..."
              value={importedText}
              onChange={(event) => setImportedText(event.target.value)}
            />
          </label>
        ) : null}
```

Below the status paragraph, add:

```tsx
        <div className="generation-progress-panel" aria-label="规划推理进度">
          <div>
            <span>规划推理进度</span>
            <p>这些是诚实的规划阶段提示；不展示未接入来源，也不冒充小红书官方搜索。</p>
          </div>
          <ol>
            {generationStages.map((stage, index) => (
              <li key={stage} className={isPending && index < 4 ? "active" : ""}>
                {stage}
              </li>
            ))}
          </ol>
        </div>
```

- [ ] **Step 6: Add CSS for the new panels**

Add to `apps/web/app/globals.css` near the form styles:

```css
.create-entry-panel,
.preference-chip-panel,
.generation-progress-panel {
  display: grid;
  gap: 12px;
  margin: 18px 0;
  border: 1px solid rgba(18, 107, 67, 0.14);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.66);
  padding: 16px;
}

.create-entry-panel span,
.preference-chip-panel span,
.generation-progress-panel span {
  display: block;
  color: var(--green);
  font-size: 12px;
  font-weight: 950;
}

.create-entry-panel strong {
  display: block;
  margin-top: 4px;
  font-size: 22px;
  letter-spacing: -0.04em;
}

.create-entry-panel p,
.generation-progress-panel p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.create-entry-actions,
.preference-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.create-entry-actions button,
.preference-chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 900;
}

.create-entry-actions .active,
.preference-chip.active {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}

.create-entry-actions button:disabled {
  cursor: not-allowed;
  color: var(--muted);
  opacity: 0.64;
}

.generation-progress-panel ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.generation-progress-panel li {
  border-radius: 14px;
  background: #fff;
  color: var(--muted);
  padding: 9px 11px;
  font-size: 13px;
  font-weight: 900;
}

.generation-progress-panel li.active {
  background: #e7fff0;
  color: var(--green);
}
```

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/components/RoutePlannerApp.test.ts
```

Expected: component tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: add light trip creation flow"
```

---

## Task 6: Build Day Itinerary Helpers And Workbench Tabs

**Files:**

- Create: `apps/web/src/domain/itinerary-days.ts`
- Create: `apps/web/src/domain/itinerary-days.test.ts`
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/src/components/RouteCard.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write helper tests**

Create `apps/web/src/domain/itinerary-days.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { dayTabsFor, filterStopsByDay, reorderStopsWithinDay } from "./itinerary-days";
import type { RouteStop } from "./types";

function stop(id: string, day: 1 | 2, poi: string): RouteStop {
  return {
    id,
    time: "10:00",
    poiId: id,
    poi,
    day,
    tags: ["walkable"],
    lat: 30,
    lng: 120,
    mapUrl: "https://uri.amap.com/marker",
    reason: `${poi} reason`,
    risk: "出发前确认。",
    sourceMode: "provider"
  };
}

test("dayTabsFor returns overview and existing route days", () => {
  const tabs = dayTabsFor([stop("a", 1, "A"), stop("b", 2, "B")]);

  assert.deepEqual(tabs, [
    { id: "overview", label: "总览" },
    { id: "day-1", label: "DAY1", day: 1 },
    { id: "day-2", label: "DAY2", day: 2 }
  ]);
});

test("filterStopsByDay keeps overview complete and day tab focused", () => {
  const stops = [stop("a", 1, "A"), stop("b", 2, "B")];

  assert.equal(filterStopsByDay(stops, "overview").length, 2);
  assert.deepEqual(filterStopsByDay(stops, "day-2").map((item) => item.poi), ["B"]);
});

test("reorderStopsWithinDay moves stops only inside the active day", () => {
  const stops = [stop("a", 1, "A"), stop("b", 1, "B"), stop("c", 2, "C")];
  const reordered = reorderStopsWithinDay(stops, 1, "b", "a");

  assert.deepEqual(reordered.map((item) => item.id), ["b", "a", "c"]);
});
```

- [ ] **Step 2: Implement helper**

Create `apps/web/src/domain/itinerary-days.ts`:

```ts
import type { RouteStop } from "./types";

export type ItineraryTabId = "overview" | "day-1" | "day-2";

export type ItineraryTab = {
  id: ItineraryTabId;
  label: string;
  day?: 1 | 2;
};

export function dayTabsFor(stops: RouteStop[]): ItineraryTab[] {
  const days = Array.from(new Set(stops.map((stop) => stop.day || 1))).sort();
  return [
    { id: "overview", label: "总览" },
    ...days.map((day): ItineraryTab => ({ id: `day-${day}` as ItineraryTabId, label: `DAY${day}`, day: day as 1 | 2 }))
  ];
}

export function dayForTab(tabId: ItineraryTabId): 1 | 2 | undefined {
  if (tabId === "day-1") return 1;
  if (tabId === "day-2") return 2;
  return undefined;
}

export function filterStopsByDay(stops: RouteStop[], tabId: ItineraryTabId): RouteStop[] {
  const day = dayForTab(tabId);
  return day ? stops.filter((stop) => (stop.day || 1) === day) : stops;
}

export function reorderStopsWithinDay(stops: RouteStop[], day: 1 | 2, draggedId: string, targetId: string): RouteStop[] {
  const dayStops = stops.filter((stop) => (stop.day || 1) === day);
  const otherStops = stops.filter((stop) => (stop.day || 1) !== day);
  const fromIndex = dayStops.findIndex((stop) => stop.id === draggedId);
  const toIndex = dayStops.findIndex((stop) => stop.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return stops;
  const nextDayStops = [...dayStops];
  const [moved] = nextDayStops.splice(fromIndex, 1);
  nextDayStops.splice(toIndex, 0, moved);
  const result: RouteStop[] = [];
  for (const stop of stops) {
    if ((stop.day || 1) === day) {
      const next = nextDayStops.shift();
      if (next) result.push(next);
    } else {
      result.push(stop);
    }
  }
  return result.concat(otherStops.filter((stop) => !result.includes(stop)));
}
```

- [ ] **Step 3: Run helper tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/itinerary-days.test.ts
```

Expected: helper tests pass.

- [ ] **Step 4: Write failing RouteCard workbench tests**

In `apps/web/src/components/RouteCard.test.ts`, add evidence fields to `routeCard`:

```ts
  evidenceSummary: "已参考 1 条公开攻略证据，用于推荐理由和风险提醒。",
  evidenceSources: [
    {
      stopId: "1-a",
      title: "杭州 citywalk 攻略",
      url: "https://example.com/hangzhou",
      sourceName: "example.com",
      snippet: "湖滨步行街适合拍照。",
      usedFor: "reason"
    }
  ],
```

Add a third stop with day 2:

```ts
    {
      id: "2-c",
      time: "10:00",
      poiId: "c",
      poi: "南宋御街",
      address: "中山中路",
      day: 2,
      tags: ["local_food"],
      lat: 30.03,
      lng: 120.03,
      mapUrl: "https://uri.amap.com/marker",
      reason: "适合吃小吃。",
      risk: "出发前确认。",
      sourceMode: "provider"
    }
```

Add assertions to the existing test:

```ts
  assert.match(markup, /总览/);
  assert.match(markup, /DAY1/);
  assert.match(markup, /DAY2/);
  assert.match(markup, /每日行程/);
  assert.match(markup, /公开攻略证据/);
  assert.match(markup, /example.com/);
```

- [ ] **Step 5: Update RouteCard to render tabs and itinerary cards**

In `apps/web/src/components/RouteCard.tsx`, update imports:

```ts
import { useEffect, useState } from "react";
import { dayForTab, dayTabsFor, filterStopsByDay, reorderStopsWithinDay, type ItineraryTabId } from "@/domain/itinerary-days";
```

After `activeStopId`, add:

```ts
  const [activeTab, setActiveTab] = useState<ItineraryTabId>("overview");
  const [orderedStops, setOrderedStops] = useState(routeCard.stops);
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [needsRevalidation, setNeedsRevalidation] = useState(false);
  const tabs = dayTabsFor(orderedStops);
  const visibleStops = filterStopsByDay(orderedStops, activeTab);
```

Add this effect after those constants so saved cards and revised routes reset stale local ordering:

```ts
  useEffect(() => {
    setOrderedStops(routeCard.stops);
    setActiveTab("overview");
    setDraggedStopId(null);
    setNeedsRevalidation(false);
    setSelectedStopId(routeCard.stops[0]?.id);
  }, [routeCard.id, routeCard.stops]);
```

Replace `RouteInteractiveMap` props:

```tsx
        <RouteInteractiveMap stops={visibleStops} selectedStopId={activeStopId} onSelectStop={setSelectedStopId} />
```

Add tabs after the chip row:

```tsx
        <div className="itinerary-tabs" role="tablist" aria-label="行程天数">
          {tabs.map((tab) => (
            <button className={tab.id === activeTab ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
              {tab.label}
            </button>
          ))}
        </div>
```

Replace the timeline map source from `routeCard.stops` to `visibleStops` and add drag handlers:

```tsx
          {visibleStops.map((stop) => (
            <button
              className={stop.id === activeStopId ? "timeline-row timeline-row--selected" : "timeline-row"}
              draggable={activeTab !== "overview"}
              key={stop.id}
              onClick={() => setSelectedStopId(stop.id)}
              onDragStart={() => setDraggedStopId(stop.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const day = dayForTab(activeTab);
                if (!day || !draggedStopId) return;
                setOrderedStops((current) => reorderStopsWithinDay(current, day, draggedStopId, stop.id));
                setDraggedStopId(null);
                setNeedsRevalidation(true);
              }}
              type="button"
            >
```

Add itinerary cards after the timeline:

```tsx
        <section className="day-itinerary-panel">
          <div className="day-itinerary-heading">
            <span>每日行程</span>
            <strong>{activeTab === "overview" ? "完整路线" : tabs.find((tab) => tab.id === activeTab)?.label}</strong>
          </div>
          <div className="day-itinerary-cards">
            {visibleStops.map((stop, index) => (
              <button className="day-itinerary-card" key={stop.id} onClick={() => setSelectedStopId(stop.id)} type="button">
                <b>{index + 1}</b>
                <span>
                  <strong>{stop.poi}</strong>
                  <em>{stop.time} · {stop.address || "地址待确认"}</em>
                  <small>{stop.reason}</small>
                </span>
              </button>
            ))}
          </div>
          {needsRevalidation ? <p className="route-revalidation-note">顺序已调整，请点击路线调整里的重新校验路线。</p> : null}
        </section>
```

Add evidence panel before risk list:

```tsx
        {routeCard.evidenceSources?.length ? (
          <section className="evidence-panel">
            <span>公开攻略证据</span>
            {routeCard.evidenceSummary ? <p>{routeCard.evidenceSummary}</p> : null}
            <div className="evidence-list">
              {routeCard.evidenceSources.slice(0, 4).map((source) => (
                <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                  <strong>{source.title}</strong>
                  <em>{source.sourceName}</em>
                  <small>{source.snippet}</small>
                </a>
              ))}
            </div>
          </section>
        ) : null}
```

- [ ] **Step 6: Add CSS for tabs, cards, evidence**

Add to `apps/web/app/globals.css`:

```css
.itinerary-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.itinerary-tabs button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 950;
}

.itinerary-tabs .active {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}

.day-itinerary-panel,
.evidence-panel {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  border: 1px solid rgba(18, 107, 67, 0.14);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.72);
  padding: 14px;
}

.day-itinerary-heading span,
.evidence-panel > span {
  display: block;
  color: var(--green);
  font-size: 12px;
  font-weight: 950;
}

.day-itinerary-heading strong {
  display: block;
  margin-top: 4px;
  font-size: 20px;
}

.day-itinerary-cards,
.evidence-list {
  display: grid;
  gap: 10px;
}

.day-itinerary-card {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #fff;
  color: inherit;
  padding: 12px;
  text-align: left;
}

.day-itinerary-card b {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 999px;
  background: var(--accent);
}

.day-itinerary-card strong,
.day-itinerary-card em,
.day-itinerary-card small {
  display: block;
}

.day-itinerary-card em,
.day-itinerary-card small,
.evidence-panel p,
.evidence-list small {
  color: var(--muted);
  font-size: 12px;
  font-style: normal;
  line-height: 1.5;
}

.route-revalidation-note {
  border-radius: 14px;
  background: #fff7df;
  color: #7c5200;
  padding: 10px 12px;
  font-weight: 900;
}

.evidence-list a {
  display: grid;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  color: var(--ink);
  padding: 12px;
  text-decoration: none;
}

.evidence-list em {
  color: var(--green);
  font-size: 12px;
  font-style: normal;
  font-weight: 950;
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/domain/itinerary-days.test.ts src/components/RouteCard.test.ts
```

Expected: focused tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add apps/web/src/domain/itinerary-days.ts apps/web/src/domain/itinerary-days.test.ts apps/web/src/components/RouteCard.tsx apps/web/src/components/RouteCard.test.ts apps/web/app/globals.css
git commit -m "feat: add day itinerary workbench"
```

---

## Task 7: Add Stop Actions, Explicit Navigation, And Revalidation Notes

**Files:**

- Modify: `apps/web/src/components/RouteInteractiveMap.tsx`
- Modify: `apps/web/src/components/RouteInteractiveMap.test.tsx`
- Modify: `apps/web/src/components/RouteCard.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.tsx`
- Modify: `apps/web/src/components/RoutePlannerApp.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing map action tests**

Add this test to `apps/web/src/components/RouteInteractiveMap.test.tsx`:

```ts
test("RouteInteractiveMap renders explicit stop edit actions and Amap navigation", () => {
  const stops = [routeStop({ id: "a", poi: "湖滨步行街", mapUrl: "https://uri.amap.com/marker?name=hubin" })];
  const markup = renderToStaticMarkup(
    React.createElement(RouteInteractiveMap, {
      stops,
      selectedStopId: "a",
      onSelectStop: () => undefined,
      onStopAction: () => undefined,
      apiKey: "",
      securityJsCode: ""
    }),
  );

  assert.match(markup, /替换这个点/);
  assert.match(markup, /删除这个点/);
  assert.match(markup, /前面加吃饭点/);
  assert.match(markup, /后面加休息点/);
  assert.match(markup, /改室内/);
  assert.match(markup, /这一段少走路/);
  assert.match(markup, /高德导航/);
  assert.match(markup, /href="https:\/\/uri\.amap\.com\/marker\?name=hubin"/);
});
```

- [ ] **Step 2: Add action types and selected-stop actions**

In `apps/web/src/components/RouteInteractiveMap.tsx`, add:

```ts
export type StopActionType = "replace" | "delete" | "add_food_before" | "add_rest_after" | "make_indoor" | "less_walking";

export type StopAction = {
  type: StopActionType;
  stopId: string;
  stopName: string;
};
```

Update props:

```ts
type RouteInteractiveMapProps = {
  stops: RouteStop[];
  selectedStopId?: string;
  onSelectStop: (stopId: string) => void;
  onStopAction?: (action: StopAction) => void;
  apiKey?: string;
  securityJsCode?: string;
};
```

Destructure `onStopAction`.

Add this constant above the component:

```ts
const stopActions: Array<{ type: StopActionType; label: string }> = [
  { type: "replace", label: "替换这个点" },
  { type: "delete", label: "删除这个点" },
  { type: "add_food_before", label: "前面加吃饭点" },
  { type: "add_rest_after", label: "后面加休息点" },
  { type: "make_indoor", label: "改室内" },
  { type: "less_walking", label: "这一段少走路" }
];
```

Inside selected stop aside, after `<small>{selectedStop.risk}</small>`, add:

```tsx
          {onStopAction ? (
            <div className="route-stop-actions">
              {stopActions.map((action) => (
                <button
                  key={action.type}
                  onClick={() => onStopAction({ type: action.type, stopId: selectedStop.id, stopName: selectedStop.poi })}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="route-navigation-actions">
            <span>导航方式</span>
            <a href={selectedStop.mapUrl} target="_blank" rel="noreferrer">
              高德导航
            </a>
          </div>
```

- [ ] **Step 3: Add CSS for actions**

Add to `apps/web/app/globals.css`:

```css
.route-stop-actions,
.route-navigation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.route-stop-actions button,
.route-navigation-actions a {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  padding: 8px 10px;
  text-decoration: none;
  font-size: 12px;
  font-weight: 900;
}

.route-navigation-actions {
  display: grid;
}

.route-navigation-actions span {
  color: var(--muted);
  letter-spacing: 0;
  text-transform: none;
}

.route-navigation-actions a {
  width: fit-content;
  background: var(--green);
  color: #fff;
}
```

- [ ] **Step 4: Wire stop actions through RouteCard**

In `apps/web/src/components/RouteCard.tsx`, update imports:

```ts
import type { StopAction } from "./RouteInteractiveMap";
```

Change component signature:

```ts
export function RouteCard({
  routeCard,
  onStopAction,
  onRevalidateOrder
}: {
  routeCard: RouteCardData;
  onStopAction?: (action: StopAction) => void;
  onRevalidateOrder?: (stops: RouteCardData["stops"]) => void;
}) {
```

Pass action prop:

```tsx
        <RouteInteractiveMap stops={visibleStops} selectedStopId={activeStopId} onSelectStop={setSelectedStopId} onStopAction={onStopAction} />
```

Replace the revalidation note with:

```tsx
          {needsRevalidation ? (
            <div className="route-revalidation-note">
              <span>顺序已调整，需要重新校验路线时间。</span>
              {onRevalidateOrder ? (
                <button onClick={() => onRevalidateOrder(orderedStops)} type="button">
                  重新校验路线
                </button>
              ) : null}
            </div>
          ) : null}
```

- [ ] **Step 5: Add revise note builder helpers**

In `apps/web/src/components/RoutePlannerApp.tsx`, add these pure helpers above `RoutePlannerApp`:

```ts
export function stopActionToReviseNote(action: StopAction): string {
  const notes: Record<StopAction["type"], string> = {
    replace: `替换「${action.stopName}」，保持路线真实可走。`,
    delete: `删除「${action.stopName}」，并重新连接前后路线。`,
    add_food_before: `在「${action.stopName}」前面加一个真实可达的吃饭点。`,
    add_rest_after: `在「${action.stopName}」后面加一个适合休息的点。`,
    make_indoor: `把「${action.stopName}」替换成室内或雨天更稳的点。`,
    less_walking: `优化「${action.stopName}」附近路线，减少步行距离。`
  };
  return notes[action.type];
}

export function reorderedStopsToReviseNote(stops: RouteCardData["stops"]): string {
  return `用户拖拽调整了当天顺序，请优先按这个顺序重新校验路线时间：${stops.map((stop) => stop.poi).join(" -> ")}`;
}
```

- [ ] **Step 6: Wire actions in RoutePlannerApp**

In `apps/web/src/components/RoutePlannerApp.tsx`, import action type:

```ts
import type { StopAction } from "./RouteInteractiveMap";
```

Add helper:

```ts
  function reviseWithNote(noteText: string) {
    if (!routeCard) {
      setStatus("请先生成一份行程，再调整路线。");
      return;
    }
    setRevisionNote(noteText);
    startTransition(async () => {
      try {
        setStatus("正在重新校验路线...");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/revise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard, reviseNote: noteText })
          }),
        );
        setRouteCard(payload.routeCard);
        setRevisionNote("");
        setStatus("已完成路线校验，可以继续编辑或保存。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function handleStopAction(action: StopAction) {
    reviseWithNote(stopActionToReviseNote(action));
  }

  function handleRevalidateOrder(stops: RouteCardData["stops"]) {
    reviseWithNote(reorderedStopsToReviseNote(stops));
  }
```

Pass props:

```tsx
            <RouteCard routeCard={routeCard} onStopAction={handleStopAction} onRevalidateOrder={handleRevalidateOrder} />
```

- [ ] **Step 7: Update tests**

Update the import in `apps/web/src/components/RoutePlannerApp.test.ts`:

```ts
import { RoutePlannerApp, reorderedStopsToReviseNote, stopActionToReviseNote } from "./RoutePlannerApp";
```

Add these tests:

```ts
test("stopActionToReviseNote creates structured route edit notes", () => {
  assert.equal(
    stopActionToReviseNote({ type: "add_food_before", stopId: "1-a", stopName: "湖滨步行街" }),
    "在「湖滨步行街」前面加一个真实可达的吃饭点。",
  );
});

test("reorderedStopsToReviseNote creates a route revalidation note", () => {
  const note = reorderedStopsToReviseNote([
    { id: "b", time: "11:00", poiId: "b", poi: "南宋御街", tags: [], lat: 30, lng: 120, mapUrl: "", reason: "", risk: "", sourceMode: "provider" },
    { id: "a", time: "10:00", poiId: "a", poi: "湖滨步行街", tags: [], lat: 30, lng: 120, mapUrl: "", reason: "", risk: "", sourceMode: "provider" }
  ]);

  assert.match(note, /重新校验路线时间/);
  assert.match(note, /南宋御街 -> 湖滨步行街/);
});
```

Also add this assertion to the workbench render test:

```ts
  assert.match(markup, /重新校验路线/);
```

In `apps/web/src/components/RouteCard.test.ts`, add assertions:

```ts
  assert.match(markup, /高德导航/);
  assert.match(markup, /替换这个点/);
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npx tsx --test src/components/RouteInteractiveMap.test.tsx src/components/RouteCard.test.ts src/components/RoutePlannerApp.test.ts
```

Expected: focused tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add apps/web/src/components/RouteInteractiveMap.tsx apps/web/src/components/RouteInteractiveMap.test.tsx apps/web/src/components/RouteCard.tsx apps/web/src/components/RouteCard.test.ts apps/web/src/components/RoutePlannerApp.tsx apps/web/src/components/RoutePlannerApp.test.ts apps/web/app/globals.css
git commit -m "feat: add itinerary stop actions"
```

---

## Task 8: Update Product Docs And Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/product/citywalk-route-cards-api.md`
- Modify: `docs/product/citywalk-route-cards-architecture.md`

- [ ] **Step 1: Fix root environment docs**

In `README.md`, replace the Environment section with:

```md
## Environment

Copy `.env.example` to `.env` at the repository root if provider keys are needed.

The app loads provider keys from the root `.env`. Do not create `apps/web/.env.local` for this project.

The MVP works without provider keys by using local fallback data. Configure `AMAP_WEB_SERVICE_KEY` for real POI candidates and walking estimates, AI provider keys for candidate-only AI arrangement, and `SEARCH_PROVIDER=exa` plus `EXA_API_KEY` for public web evidence.

Saved route cards use a local SQLite database by default at `apps/web/.data/route-cards.sqlite`. Set `ROUTE_CARD_DATABASE_FILE` in the root `.env` to use another database file.
```

- [ ] **Step 2: Update API docs**

In `docs/product/citywalk-route-cards-api.md`, add this bullet under generation modes:

```md
- `SEARCH_PROVIDER=exa` + `EXA_API_KEY`: adds public web evidence for route reasons, risk hints, and source links. Exa evidence never overrides Amap POI facts.
```

Replace the request example with:

```json
{
  "city": "杭州",
  "themeId": "easy_citywalk",
  "startDate": "2026-05-10",
  "durationDays": 1,
  "note": "想拍照，别太累",
  "tripPreferences": ["citywalk", "拍照出片", "少走路"],
  "importedText": "朋友推荐湖滨步行街、南宋御街、城市阳台",
  "transportPreference": "walk_first",
  "companion": "friends"
}
```

Add this paragraph after the response example:

```md
When Exa is configured, the route card may include `evidenceSummary` and `evidenceSources`. These fields are display-safe supporting evidence. They are not POI facts and do not create route stops.
```

- [ ] **Step 3: Update architecture docs**

In `docs/product/citywalk-route-cards-architecture.md`, insert a new section after "Provider And AI Boundary":

```md
## Web Evidence Boundary

`web-evidence-provider` is optional and server-side only.

The first provider is Exa Search. It searches public web pages for travel guide context, warnings, reservation hints, seasonal notes, and source links.

Evidence is attached to route cards as `evidenceSummary` and `evidenceSources`. It supports explanation and risk assessment but cannot create POIs, change coordinates, or override Amap addresses.

If Exa is not configured or fails, planning continues with Amap facts and AI/rule arrangement.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npm run verify
```

Expected:

- `npm run typecheck` passes.
- all Node tests pass.
- `next build` passes.

- [ ] **Step 5: Run browser smoke test**

Run the app:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npm run dev
```

Open `http://localhost:3000` in the in-app browser and smoke-test:

- The page shows "我的行程".
- "创建新计划" and "智能导入地点/行程" switch the input mode.
- Chips toggle visually.
- Generate produces a route with no missing-key crash.
- The result shows map fallback or Amap map depending on configured JSAPI keys.
- Tabs show "总览" and day tabs when the route has multiple days.
- Stop details show edit actions.
- "高德导航" is the only map handoff and requires an explicit click.

- [ ] **Step 6: Commit**

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git add README.md docs/product/citywalk-route-cards-api.md docs/product/citywalk-route-cards-architecture.md
git commit -m "docs: document real evidence itinerary planner"
```

---

## Final Verification Before Completion

Run:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip/apps/web
npm run verify
```

Expected: typecheck, tests, and build pass.

Check git:

```bash
cd /Users/xujinliang/Kaifa/AI-Trip
git status --short
git log --oneline -8
```

Expected: no uncommitted files except intentional runtime files ignored by git; recent commits match the task commits above.

## Spec Coverage Review

Covered requirements:

- Light home/create entry: Task 5.
- Natural language plus chips: Tasks 1, 2, and 5.
- Smart import from pasted text: Tasks 1, 2, and 5.
- Honest generation progress: Task 5.
- Amap fact source remains authoritative: Tasks 3 and 4.
- Exa public web evidence: Tasks 3 and 4.
- Day tabs and daily itinerary cards: Task 6.
- In-app marker/card selection: Task 6 keeps selected-stop synchronization.
- Point edit actions: Task 7.
- Explicit Amap navigation: Task 7.
- Drag sorting and revalidation state: Tasks 6 and 7.
- Docs and verification: Task 8.

No spec requirement is intentionally left uncovered in this implementation plan.
