# Citywalk Route Cards API

## `POST /api/planning-jobs`

Creates a durable planning job in PostgreSQL. The request body wraps the route
planning request under `request`; the web app can pass `runImmediately: true`
to execute the LangGraph planner in-process while the RocketMQ consumer is not
yet running as a separate daemon.

Response status is `202`. The returned `job` is `queued`, `running`,
`completed`, or `failed`. Completed jobs include `resultPayload.routeCard` and
`resultPayload.planningTrace`. The executor also persists trace events into
`planning_trace_events` for job-level observability.

A separate worker process consumes those RocketMQ events with:

```bash
npm run worker:planning -- --daemon
```

Successful, ignored, and not-found messages are acknowledged. Failed or thrown
planning executions are intentionally left unacked so RocketMQ can redeliver
them according to broker policy.

## `GET /api/planning-jobs/:id`

Returns the durable planning job for polling. The frontend reads
`resultPayload.routeCard` when status is `completed`. The response can include
`job.traceEvents`, ordered by sequence, so the UI can prefer the durable
planning ledger over the final result payload.

## `POST /api/planning-jobs/:id/run`

Executes one planning job through the server-side LangGraph executor. This is
the local worker boundary and can also be called by a future RocketMQ consumer.

The CLI worker keeps the same boundary:

```bash
npm run worker:planning -- --daemon
npm run worker:planning -- --daemon --max-batches 1
npm run worker:planning -- <planning-job-id>
npm run worker:planning -- --event '{"type":"planning.job.created","jobId":"<planning-job-id>","requestedAt":"2026-05-10T00:00:00.000Z"}'
```

## `POST /api/route-cards/generate`

Generation mode is environment-driven:

- `AMAP_WEB_SERVICE_KEY` + `AI_PROVIDER=openai` + `OPENAI_API_KEY`: uses Amap real POIs, OpenAI candidate-only arrangement, and Amap walking time.
- `AMAP_WEB_SERVICE_KEY` + `AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`: uses Amap real POIs, DeepSeek candidate-only arrangement, and Amap walking time.
- `AMAP_WEB_SERVICE_KEY` + `AI_PROVIDER=bailian` + `BAILIAN_API_KEY`: uses Amap real POIs, Alibaba Cloud Bailian candidate-only arrangement, and Amap walking time.
- `AMAP_WEB_SERVICE_KEY` only: uses Amap real POIs with deterministic rule arrangement.
- `SEARCH_PROVIDER=exa` + `EXA_API_KEY`: adds public web evidence for route reasons, risk hints, and source links. Exa is the default search provider in `.env.example`, but the real key must stay in the root `.env`. Exa evidence never overrides Amap POI facts.
- No provider keys or provider failure: falls back to local seed data.

If `AI_PROVIDER` is unset, the server defaults to `openai`. AI output is accepted only when it selects known Amap candidate IDs and passes local validation.

Route cards may include `planningMode`, `intentSummary`, `blueprintSummary`, `arrangementReason`, `skipSuggestion`, `weatherAlternative`, and `providerWarnings`.

Request:

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

Response:

```json
{
  "routeCard": {
    "id": "uuid",
    "city": "杭州",
    "themeId": "easy_citywalk",
    "title": "杭州轻松 citywalk",
    "highlights": ["西湖湖滨 是路线主节点"],
    "fitFor": "适合想要轻松 citywalk、不想做复杂攻略的轻旅行用户。",
    "riskTips": ["交通时间为规则估算，实际以地图导航为准。"],
    "sourceLabel": "本地示例数据"
  }
}
```

When Exa is configured, the route card may include `evidenceSummary` and `evidenceSources`. These fields are display-safe supporting evidence. They are not POI facts and do not create route stops.

## `POST /api/route-cards/revise`

Revises the current route card with a user adjustment note. This endpoint keeps the original city, theme, date, and duration, enriches the next planning note with the current stop list and revision request, then runs the same Amap + AI/provider planning pipeline used by generation.

The revision path follows the same safety rule as generation: AI can only arrange known Amap candidates, and provider failure falls back to deterministic or local planning.

Request:

```json
{
  "routeCard": {
    "id": "uuid",
    "city": "杭州",
    "themeId": "easy_citywalk",
    "startDate": "2026-05-10",
    "durationDays": 1,
    "stops": []
  },
  "reviseNote": "少走路一点，加一个吃饭点"
}
```

Response:

```json
{
  "routeCard": {
    "id": "new-uuid",
    "city": "杭州",
    "revisionNote": "少走路一点，加一个吃饭点",
    "revisionSummary": "已根据「少走路一点，加一个吃饭点」重新调整路线。"
  }
}
```

## `GET /api/route-cards`

Returns saved route-card summaries.

Each summary includes `sharePath`, such as `/share/<id>`, for opening the saved share page.

Saved route cards are persisted in PostgreSQL through Prisma.

## `POST /api/route-cards`

Saves a generated route card.

## `GET /api/route-cards/:id`

Returns one saved route card.

Used by the main page to load a saved route back into the preview panel.

## `DELETE /api/route-cards/:id`

Deletes one saved route card.

Used by the main page saved-list delete action.
