# Route Workbench v2 Design

## Goal

Turn the route-card generator into a lightweight route workbench: users can revise a generated route with natural-language requests and quick actions, then save the revised version.

## Market References

This design borrows proven mechanics without copying UI:

- Wanderlog: itinerary workspace with saved places, map context, and route refinement.
- Roadtrippers: route-first planning, along-the-way additions, and AI-assisted trip shaping.
- TripIt: one itinerary as the central object.
- Ctrip AI itinerary planner: destination, days, style, travel time, and attraction facts.
- Amap: real POI and navigation as the trusted fact layer.

## Product Behavior

After a route card is generated, the preview panel shows a "revise route" module:

- Free text input: "少走路一点，加一个吃饭点，不要寺庙"
- Quick actions:
  - 少走路
  - 加吃饭点
  - 下雨改室内
  - 更省钱
  - 去掉寺庙
  - 压缩成半日
- Button: "重新调整路线"

When submitted:

1. The client sends the current `routeCard` plus `reviseNote`.
2. The server creates a new route request using the original city, theme, date, duration, and an enriched note that includes the revision.
3. The real planner uses the same Amap + AI/provider pipeline.
4. The response returns a new route card.
5. The new card includes `revisionSummary` so users can see what changed.
6. Users can save the revised card with the existing save button.

## Technical Design

Add domain helper:

```ts
reviseRouteCard(input: {
  routeCard: RouteCard;
  reviseNote: string;
}): Promise<RouteCard>
```

Initial implementation should call `generateRealRouteCard` with:

- same city/theme/startDate/durationDays
- note composed from:
  - original `intentSummary` or original `fitFor`
  - current route stop names
  - user's revise note

Add optional `revisionSummary` and `revisionNote` fields to `RouteCard`.

Add API:

```http
POST /api/route-cards/revise
```

Request:

```json
{
  "routeCard": { "...": "current card" },
  "reviseNote": "少走路一点，加一个吃饭点"
}
```

Response:

```json
{
  "routeCard": { "...": "new revised card" }
}
```

Validation:

- `routeCard.id`, `routeCard.city`, `routeCard.themeId`, `routeCard.stops[]` are required.
- `reviseNote` must be non-empty after trimming.
- Invalid request returns `400 BAD_REQUEST`.

## Safety Boundary

Revision cannot invent POIs. It still goes through the existing real planner:

- Amap supplies candidates.
- AI providers arrange only candidate IDs.
- `validateAiArrangement` rejects unsafe IDs.
- Rule and seed fallbacks remain.

## UI Design

Place the workbench under the generated card actions in `RoutePlannerApp`.

State:

- `revisionNote`
- `lastRevisionSummary`

User flow:

1. User clicks a quick action or types custom text.
2. User clicks "重新调整路线".
3. Status shows "正在根据你的要求调整路线...".
4. Preview updates to revised card.
5. Status shows "已按要求调整路线，可以保存这一版。"

## Testing

Add tests for:

- `reviseRouteCard` composes a revision note and returns a new card with revision metadata.
- Revise API returns a revised card for valid body.
- Revise API rejects missing or empty `reviseNote`.
- `RoutePlannerApp` renders revise input, quick actions, and submit button.

## Out Of Scope

- Drag-and-drop timeline editing.
- Side-by-side version history.
- Saving parent/child route version graph.
- Map drawing or navigation handoff changes.
- User accounts.
