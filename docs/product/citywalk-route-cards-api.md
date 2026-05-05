# Citywalk Route Cards API

## `POST /api/route-cards/generate`

Generation mode is environment-driven:

- `AMAP_WEB_SERVICE_KEY` + `AI_PROVIDER=openai` + `OPENAI_API_KEY`: uses Amap real POIs, OpenAI candidate-only arrangement, and Amap walking time.
- `AMAP_WEB_SERVICE_KEY` + `AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`: uses Amap real POIs, DeepSeek candidate-only arrangement, and Amap walking time.
- `AMAP_WEB_SERVICE_KEY` only: uses Amap real POIs with deterministic rule arrangement.
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
    "title": "杭州轻松 citywalk",
    "highlights": ["西湖湖滨 是路线主节点"],
    "fitFor": "适合想要轻松 citywalk、不想做复杂攻略的轻旅行用户。",
    "riskTips": ["交通时间为规则估算，实际以地图导航为准。"],
    "sourceLabel": "本地示例数据"
  }
}
```

## `GET /api/route-cards`

Returns saved route-card summaries.

Each summary includes `sharePath`, such as `/share/<id>`, for opening the saved share page.

## `POST /api/route-cards`

Saves a generated route card.

## `GET /api/route-cards/:id`

Returns one saved route card.

Used by the main page to load a saved route back into the preview panel.

## `DELETE /api/route-cards/:id`

Deletes one saved route card.

Used by the main page saved-list delete action.
