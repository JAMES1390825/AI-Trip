# Pretrip Checklist v1 Design

## Goal

Help users decide whether a generated route is safe enough to follow by adding a route-specific pretrip checklist and risk confirmation panel.

The route card should feel less like an AI answer and more like a practical travel object: before leaving, the user can see what to confirm, what to bring, and what could go wrong.

## Product Behavior

Each generated or revised route card includes a `pretripChecklist` section.

Checklist items are grouped by category:

- `time`: opening hours, early/late stops, schedule pressure.
- `weather`: outdoor exposure, rain-friendly backup.
- `traffic`: long walking legs, degraded map estimates.
- `booking`: reservation, ticket, queue, or opening-status confirmation.
- `budget`: estimated cost and low-budget reminders.
- `comfort`: walking intensity, meal gap, family/elderly pacing.

Each item has:

- `id`
- `category`
- `title`
- `detail`
- `severity`: `info`, `warning`, or `critical`
- `actionLabel`
- optional `relatedStopId`

Example:

```json
{
  "category": "booking",
  "title": "出发前确认营业状态",
  "detail": "灵隐寺参考营业时间 07:00-18:15，出发前建议确认开放和预约规则。",
  "severity": "warning",
  "actionLabel": "确认开放时间",
  "relatedStopId": "1-lingyin"
}
```

## Product Placement

In the active route preview:

1. Show a compact "出发前检查" panel below the route card.
2. Display summary chips:
   - checklist count
   - highest severity
   - outdoor/rain risk when relevant
3. Show individual checklist rows with category, title, detail, and action label.
4. Keep the panel read-only in v1. Completion state is out of scope.

This should also appear on saved share pages so shared routes preserve the same trust layer.

## Technical Design

Add domain module:

```ts
buildPretripChecklist(routeCard: RouteCard): PretripChecklistItem[]
```

Add types:

```ts
type PretripChecklistCategory =
  | "time"
  | "weather"
  | "traffic"
  | "booking"
  | "budget"
  | "comfort";

type PretripChecklistSeverity = "info" | "warning" | "critical";

type PretripChecklistItem = {
  id: string;
  category: PretripChecklistCategory;
  title: string;
  detail: string;
  severity: PretripChecklistSeverity;
  actionLabel: string;
  relatedStopId?: string;
};
```

Extend `RouteCard`:

```ts
pretripChecklist?: PretripChecklistItem[];
```

Generation paths:

1. `generateRouteCard` adds checklist from local route facts.
2. `generateRealRouteCard` adds checklist after assembling or fallback route card.
3. `reviseRouteCard` preserves checklist by relying on the generated revised card.

No new external API is needed in v1. Checklist generation uses existing facts:

- stop risk copy
- stop tags
- leg minutes and degraded state
- route duration
- estimated cost
- provider warnings
- weather alternative
- skip suggestion
- theme id

## Rules

Initial deterministic rules:

- If any stop has a non-all-day opening/risk string, add a `time` or `booking` confirmation item.
- If any stop is not indoor, add a `weather` item.
- If any leg is over 30 minutes or degraded, add a `traffic` item.
- If `estimatedCostCny >= 400`, add a `budget` item.
- If route has 4+ stops in one day or total transit exceeds 70 minutes, add a `comfort` item.
- If `weatherAlternative` exists, add a weather backup item.
- Deduplicate items by category/title and cap to 5 items.

## UI Design

Add `PretripChecklist` component.

Use a trust-oriented visual style, distinct from share wrappers:

- Pale document/card background.
- Category pills.
- Severity color accents.
- Concise action labels.

The component should render gracefully when no checklist exists by showing nothing.

## API And Persistence

No new API route is required.

Checklist is part of the route card JSON, so existing save/list/detail APIs continue to work. Saved cards should store the checklist automatically because the full route card payload is already persisted.

## Testing

Add tests for:

- `buildPretripChecklist` creates weather/time/traffic/budget/comfort items from route facts.
- Planner-generated fallback route cards include `pretripChecklist`.
- Real planner fallback and provider routes include `pretripChecklist`.
- `RouteCard` or `PretripChecklist` renders "出发前检查" and key item titles.
- Share page continues to render route cards with checklist data.

## Out Of Scope

- User-checkable task completion.
- Push reminders or calendar integration.
- Live weather API.
- Live opening-hours verification.
- Booking/ticket purchase.
- User accounts or synced checklist state.
