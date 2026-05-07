# Web V1.2 Smart Import Design

## Goal

Turn "智能导入地点/行程" from a plain text box into a real trip creation entry: users paste a place list, itinerary note, chat message, or攻略片段, and AI Trip extracts a usable planning draft before generation.

## Product Direction

V1.2 should reduce the user's input burden. Instead of asking users to manually move information from a pasted note into several fields, the app should parse the note, show what it understood, and let the user apply that draft to the existing planner.

This keeps AI Trip focused on C-end personal travel planning:

- create from natural language,
- import lightweight places and constraints,
- generate one best route,
- edit and save the result.

Sharing remains secondary.

## User Problem

Real users rarely start with a clean form. They usually have messy inputs:

- a friend sends "西湖、法喜寺、南宋御街，别太赶",
- a note says "周六杭州，下午到，想拍照和小吃",
- an攻略片段 includes several place names mixed with descriptions,
- a user wants to avoid manually copying each place into the right field.

If the app only provides a blank text area, the user still has to translate their note into form fields. Smart import should do that first pass.

## Scope

### 1. Import Parser Domain Module

Add a deterministic parser module that extracts a planning draft from pasted text.

The parser should identify:

- likely place names,
- must-go text,
- avoid or constraint text,
- city hints,
- preference chips,
- start or end area hints when obvious,
- confidence and parse notes.

This can be rule-based for V1.2. Do not call an external LLM just to parse import text. The goal is a reliable local first pass that can later be upgraded.

### 2. Import Draft Type

Add a focused type, for example `TripImportDraft`, with fields:

- `rawText`,
- `cityHint`,
- `placeNames`,
- `mustVisitText`,
- `avoidText`,
- `noteHint`,
- `preferenceHints`,
- `startPointHint`,
- `endPointHint`,
- `confidence`,
- `parseNotes`.

This type should stay separate from `RouteCardRequest` because it represents "understood draft", not a final generation request.

### 3. Planner UI

When users switch to "智能导入地点/行程":

- show the pasted text area,
- show a "识别导入内容" action,
- render an import draft panel after parsing,
- show recognized place chips,
- show recognized constraints,
- show an "应用到规划表单" action.

Applying the draft should update existing planner state:

- city if a confident city hint exists,
- `mustVisitText` from parsed place names,
- `avoidText` from parsed constraints,
- `note` with parsed note hints,
- `tripPreferences` with parsed preference chips,
- start/end area when obvious.

The user can still edit everything before generation.

### 4. Generation Chain

Do not add a new generation endpoint. Reuse the existing `/api/route-cards/generate` request shape.

After the draft is applied, generation should benefit from the V1.1 fields:

- `mustVisitText` enters Amap search queries,
- `avoidText` enters constraints and quality summary,
- preference chips influence intent and route theme,
- route quality summary explains what was recognized and considered.

### 5. Empty And Error States

The parser should be forgiving:

- empty text returns no draft and a user-facing hint,
- low-confidence text still shows editable notes,
- repeated place names are deduped,
- unsafe or overly long pasted text is capped before display/use.

No hidden failure should block the main planner.

## Non-Goals

- OCR or image import.
- Xiaohongshu scraping.
- Browser extension collection.
- External LLM parsing.
- Multi-city trip splitting.
- Account-level import history.
- Full booking or reservation import.

## Architecture Notes

- Keep parser logic in `apps/web/src/domain/trip-import-parser.ts`.
- Keep parser tests in `apps/web/src/domain/trip-import-parser.test.ts`.
- Extend shared domain types in `apps/web/src/domain/types.ts`.
- Keep UI state local to `RoutePlannerApp`.
- Do not introduce a new API route unless server-side parsing becomes necessary later.
- Keep all parsing deterministic and easy to test.

## Acceptance Criteria

1. A user can paste imported trip text and click "识别导入内容".
2. The app renders a visible import draft panel with recognized places, constraints, preference hints, and confidence.
3. The user can apply the draft to the planner form.
4. Applying the draft updates must-go places, avoid constraints, note, chips, and city/start/end hints where available.
5. The existing generate flow uses the applied fields without a separate endpoint.
6. Parser tests cover Chinese place lists, constraints, preference hints, city hints, duplicate places, and empty input.
7. RoutePlannerApp tests cover the import draft UI and apply action copy.
8. Full verification passes before merge.

## Self-Review

- Placeholder scan: no TBD or open-ended placeholders remain.
- Internal consistency: the feature is client/domain-only and reuses the existing generation endpoint.
- Scope check: focused enough for one implementation plan; OCR, scraping, and account history are excluded.
- Ambiguity check: parser is explicitly deterministic for V1.2, not external LLM-based.
