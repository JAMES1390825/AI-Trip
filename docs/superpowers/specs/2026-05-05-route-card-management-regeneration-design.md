# Route Card Management And Regeneration Design

## Status

Approved direction from product discussion on 2026-05-05.

## Goal

Turn the route-card MVP from "generate once and save" into a small usable loop:

- Generate a route.
- Save it.
- Reopen saved routes in the preview.
- Delete routes that are no longer useful.
- Regenerate another version using the same current preferences.
- Choose one-day or two-day duration.

## Product Behavior

The main page remains the primary workspace. The left panel controls inputs and saved routes; the right panel previews the active route card.

Saved-list rows should include:

- `预览`: load the saved route card into the preview panel.
- `打开 / 分享`: open `/share/:id` in a new tab.
- `删除`: delete the saved route card and refresh the list.

The active preview should include:

- `再生成一版`: call the generate endpoint using the current city, theme, date, duration, and note.
- Existing save, open share page, copy link, poster/story controls.

The form should include a duration selector:

- `1日`
- `2日`

## Planner Behavior

`durationDays` should affect output enough to be visible:

- 1-day routes keep 3-4 stops.
- 2-day routes use 5-6 stops when enough seed POIs exist.
- The title and summary should mention duration.
- Time labels can remain a simple sequence for MVP; exact day grouping is not required yet.

The planner must remain deterministic and data-based. It can use more stops from fallback seed data, but must not invent POIs.

## API And Store Behavior

Existing endpoints are sufficient:

- `GET /api/route-cards/:id` loads one saved card.
- `DELETE /api/route-cards/:id` deletes one saved card.
- `POST /api/route-cards/generate` regenerates from current form inputs.

No new API endpoint is required.

## Error Handling

- Loading a deleted/missing saved card should show a friendly status message and keep the current preview unchanged.
- Delete failures should show a status message and keep the saved list unchanged.
- Regenerate failures should show the existing request error message.

## UI Notes

Keep the visual style consistent with the current editorial card UI. Saved-list actions should be compact pills, not a heavy table. The duration selector should live near city/date because it is part of trip scope.

## Testing

Add/update automated tests for:

- Planner returns more stops for two-day routes than one-day routes when data allows.
- Planner title or summary reflects `durationDays`.
- Detail route handler can load a saved card.
- Delete route handler removes a saved card.

Manual verification:

- Generate a 1-day route.
- Save it.
- Load it from saved list.
- Copy/open share link.
- Delete it.
- Generate a 2-day route and confirm it feels visibly longer.

## Success Criteria

- `bash scripts/dev.sh verify` passes.
- Saved cards can be loaded and deleted from the main page.
- Users can regenerate from the same preferences.
- Users can select 1-day or 2-day routes.
