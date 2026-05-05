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

## `DELETE /api/route-cards/:id`

Deletes one saved route card.
