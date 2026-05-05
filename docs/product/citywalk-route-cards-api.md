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
