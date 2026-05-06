# Real Evidence Itinerary Planner Design

## Goal

Upgrade AI Trip from a route-card generator into a real C-end travel planning workbench.

The next version should help a user turn a lightweight travel idea into one best itinerary that is:

- easy to create
- grounded in real map data
- supported by public web evidence
- visible on an in-app map
- editable before departure
- organized by day

Sharing wrappers and capture/recognition features are lower priority. The product focus is travel planning.

## Product Positioning

AI Trip helps users turn one travel thought into a verifiable, editable, executable itinerary.

The app should not feel like a heavy form or a poster tool. It should feel like a travel workbench: create lightly, watch the plan take shape, inspect the route, edit stops, and execute the trip.

## Competitive Learning

The reference video shows four patterns worth learning:

- A light creation entry from "My Trips" with a prominent plus button.
- Natural language plus a small set of preference chips, instead of a long form.
- Transparent generation progress that makes the planner feel like it is actually researching and reasoning.
- A result page centered on map plus daily itinerary cards, with overview and day tabs.

AI Trip should learn these product patterns without copying the exact interface or claiming data sources it does not actually use.

## Scope

### In Scope

- Home structure around saved trips.
- Prominent create entry.
- Create-new-plan flow.
- Smart import entry for pasted places or itinerary text.
- Natural-language planning input.
- Lightweight preference chips.
- Transparent generation stages.
- Amap-grounded POI and route validation.
- Exa-backed public web evidence when configured.
- In-app map route display.
- Overview and day tabs.
- Day itinerary cards.
- Point-level edit actions.
- Drag sorting itinerary stops.
- Explicit Amap navigation button from stop details.

### Out of Scope

- Capture recognition from screenshots, camera, or OCR.
- Official Xiaohongshu integration.
- Claiming Xiaohongshu, Mafengwo, Ctrip, or weather search unless a real provider was called.
- Multi-route A/B/C versions.
- Social sharing as a primary workflow.
- Real-time turn-by-turn navigation inside AI Trip.
- Booking, ticketing, hotel, or restaurant reservation transactions.

## User Flow

### 1. Home

The default home is "我的行程".

It shows saved trips and a prominent bottom create button. Empty state should push creation, not sharing.

The create button opens a small action menu:

- 创建新计划
- 智能导入地点/行程
- 采集识别

"采集识别" is shown as a future capability or hidden in the first implementation. It is not implemented in this version.

### 2. Create New Plan

The creation form stays light:

- destination prompt: "你想去哪里?"
- duration prompt: "你想去多久?"
- date or start date when available
- preference chips
- free-text note

Preference chips should include:

- 经典必玩
- 吃喝逛
- 亲子
- citywalk
- 历史古迹
- 小众探索
- 拍照出片
- 自然风光
- 文艺展览
- 室内备选
- 少走路
- 预算友好

The free-text note remains the strongest signal. Chips are supporting constraints, not rigid route templates.

### 3. Smart Import

Smart import accepts pasted text such as place lists, rough itinerary notes, public article snippets, or user-collected recommendations.

The first version does not need OCR or link crawling. It parses pasted text into planning intent and candidate preferences, then runs the same planning pipeline as create-new-plan.

### 4. Transparent Generation

Generation should show a real planning log. The stages should reflect actual system work:

1. 理解旅行需求
2. 构思路线骨架
3. 高德搜索真实地点
4. Exa 检索公开攻略证据
5. 筛选候选点
6. 估算路上时间
7. 生成每日行程
8. 生成行前提醒

If Exa is not configured, the Exa stage should be skipped or shown as degraded copy such as "未配置全网证据源，已使用地图事实和 AI 编排".

The UI must not display "正在搜索小红书官方" unless there is a real official Xiaohongshu provider. If Exa returns a public Xiaohongshu page, the app may show that page as a public web source.

### 5. Result Workbench

The result page is a planning workbench, not just a card.

It contains:

- top summary with city, days, route theme, confidence, and source label
- tabs: 总览, DAY1, DAY2, and more days later
- in-app map
- numbered stop markers
- route polyline
- selected stop detail
- itinerary cards grouped by day
- edit actions
- source evidence
- risk and pretrip checklist

In overview mode, the map shows the full route. In a day tab, the map and itinerary list focus on that day.

### 6. Stop Details

Clicking a map marker or itinerary card selects a stop inside AI Trip. It must not immediately jump to Amap.

The selected stop detail shows:

- stop name
- time
- address
- recommendation reason
- evidence snippets or source links when available
- risk note
- edit actions
- navigation action

The navigation action is explicit. The first supported option is 高德地图.

### 7. Editing

Point-level editing should support:

- 替换这个点
- 删除这个点
- 前面加吃饭点
- 后面加休息点
- 改室内
- 这一段少走路

These actions should reuse the existing route revision pipeline at first by generating structured revise notes. The route is regenerated and revalidated against real POI candidates.

### 8. Drag Sorting

Users can drag itinerary cards to reorder stops.

After the user changes order, the UI shows a clear action such as "重新校验路线". The app then recalculates route timing and asks AI/rules to repair the route if the order becomes impractical.

The first implementation can support drag sorting within the current active day. Cross-day moving can be added later.

## Data Source Strategy

### Amap As Fact Source

Amap remains the source of truth for:

- POI existence
- provider POI ID
- name
- address
- coordinates
- map URL
- route time estimate

AI must not invent POI facts. Exa must not override Amap coordinates or addresses.

### Exa As Evidence Source

Exa is added as the first web evidence provider.

It is used for:

- public web travel guides
- recent recommendation context
- why a place is worth visiting
- common warnings
- reservation or opening-hour hints
- seasonal notes
- source links

Exa evidence supports explanation and risk assessment. It does not validate map truth.

### AI As Planner

AI receives:

- user request
- structured intent
- Amap candidate POIs
- route-time context
- Exa evidence summaries when available

AI may:

- select candidate IDs
- order stops
- explain why
- propose skip suggestions
- create weather or indoor alternatives
- summarize evidence

AI may not:

- invent places outside the candidate set
- rewrite Amap addresses or coordinates
- claim a source that was not used
- present stale web evidence as guaranteed real-time truth

## Technical Design

### Provider Boundary

Add a provider-neutral evidence layer:

```ts
export type WebEvidenceProvider = {
  searchEvidence(input: WebEvidenceRequest): Promise<WebEvidenceResult[]>;
};
```

The first implementation should support:

- `SEARCH_PROVIDER=exa`
- `EXA_API_KEY`

If `SEARCH_PROVIDER` is unset or Exa has no key, evidence search becomes a no-op and planning still works with Amap plus AI/rules.

### Evidence Data Shape

Evidence should be stored on the route card in a compact, display-safe shape:

```ts
export type StopEvidence = {
  stopId: string;
  title: string;
  url: string;
  sourceName: string;
  snippet: string;
  usedFor: "reason" | "risk" | "season" | "reservation" | "context";
};
```

Route-level evidence can be added as:

```ts
evidenceSummary?: string;
evidenceSources?: StopEvidence[];
```

The UI should show source labels and links, but avoid dumping raw search output.

### Planning Request

Extend the planning request with lightweight constraints:

```ts
tripPreferences?: string[];
importedText?: string;
startPoint?: string;
endPoint?: string;
transportPreference?: "walk_first" | "public_transit_ok" | "taxi_ok";
companion?: "solo" | "friends" | "couple" | "family" | "elderly";
```

These fields enrich intent. They do not create separate route versions.

### Planning Pipeline

The route generation pipeline becomes:

1. Parse user input and chips into intent.
2. Build a single route blueprint.
3. Search Amap POI candidates.
4. Search Exa web evidence for route and candidate context when configured.
5. Arrange candidate-only route with AI.
6. Fall back to deterministic arrangement if AI fails.
7. Estimate route legs with Amap.
8. Assemble day-grouped itinerary.
9. Build pretrip checklist and evidence display.

### Generation Progress

The first implementation can show frontend progress states around the existing API call. Backend streaming is not required for this version.

The UI should mark only honest states. If a stage cannot be individually timed by the backend yet, the label should be presented as a planning-stage indicator, not as proof that a separate provider call has completed. The whole progress sequence finishes when the API returns.

Streaming progress can be a later optimization.

### UI Components

The current `RouteCard` should evolve toward a workbench structure:

- `TripHome`
- `CreateTripMenu`
- `TripPlanningForm`
- `GenerationProgress`
- `ItineraryWorkbench`
- `ItineraryTabs`
- `DayItineraryPanel`
- `StopDetailPanel`
- `EvidenceSources`

Existing `RouteInteractiveMap` stays responsible for the Amap JSAPI rendering and selected-stop synchronization.

## Error Handling

If Amap fails or returns too few candidates:

- fall back to local seed data
- show clear degraded source copy
- do not show Exa-only generated POIs as facts

If Exa fails:

- continue route planning
- show "未获取到公开攻略证据"
- omit evidence sections

If AI fails:

- use deterministic route arrangement
- keep Amap facts
- show rule-planning source label

If route-time estimation fails:

- use coordinate fallback estimate
- mark affected legs as estimated

## Testing

Add or update tests for:

- preference chips and imported text included in planning requests
- Exa provider no-key no-op behavior
- Exa result normalization
- AI arrangement still restricted to Amap candidate IDs
- evidence cannot create new POIs
- generation progress labels avoid unsupported source claims
- day tabs group stops by day
- marker and itinerary card selection stays inside the app
- navigation button is explicit
- drag sorting creates a revalidation state
- degraded states when Amap, Exa, or AI are unavailable

Run the existing web verification suite before claiming implementation complete.

## Acceptance Criteria

- Users can start from "我的行程" and create a plan through a light entry.
- Users can enter a natural language request and chips without a heavy form.
- Generation shows transparent, honest progress without pretending unsupported sources were queried.
- The result displays an in-app map plus day-grouped itinerary cards.
- DAY tabs filter the map and itinerary list.
- Stop selection happens inside AI Trip.
- Navigation to Amap only happens through an explicit navigation button.
- Exa evidence, when configured, appears as supporting sources and does not override Amap facts.
- Missing Exa does not block route generation.
- AI cannot add POIs that Amap did not return.

## Open Decisions

No implementation-blocking open decisions remain.

Future decisions:

- Whether to expose "采集识别" as disabled copy or hide it.
- Whether to add backend streaming progress.
- Whether to add official Xiaohongshu integration if a legal API or partnership becomes available.
- Whether to support cross-day drag moving after within-day sorting works well.
