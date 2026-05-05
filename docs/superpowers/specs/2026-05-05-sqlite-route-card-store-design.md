# SQLite Route Card Store Design

## Goal

Replace the route-card JSON file store with SQLite while keeping the existing API and frontend behavior unchanged.

## Context

Route cards are currently persisted by rewriting a JSON file through `createRouteCardStore`. This works for MVP demos but is fragile for concurrent writes and awkward for future querying. The current runtime uses Node 25, which exposes `node:sqlite`, so the project can use SQLite without adding a native npm dependency.

## Product Behavior

No user-facing behavior changes:

- `POST /api/route-cards` saves a generated card.
- `GET /api/route-cards` lists saved summaries newest first.
- `GET /api/route-cards/:id` loads a saved card.
- `DELETE /api/route-cards/:id` deletes a saved card.
- Share paths remain `/share/<id>`.

## Technical Design

Use SQLite as the default storage backend.

Environment variables:

```bash
ROUTE_CARD_DATABASE_FILE=
```

Default path:

```text
apps/web/.data/route-cards.sqlite
```

Implementation:

- Keep the existing `RouteCardStore` interface.
- Keep `createRouteCardStore(path?)` for test/API compatibility, but interpret the argument as a SQLite database file path.
- Create table on first use:

```sql
CREATE TABLE IF NOT EXISTS route_cards (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  theme_label TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
```

- `save` uses upsert by `id`.
- `list` orders by `created_at DESC`.
- `get` parses `payload`.
- `delete` returns whether a row was removed.

`ROUTE_CARD_DATA_FILE` remains as a temporary backward-compatible alias for tests and older local env files. New docs should use `ROUTE_CARD_DATABASE_FILE`.

## Testing

Add or update tests so they prove:

- Store creates a SQLite database file.
- Store survives a new store instance pointing at the same file.
- API route tests use isolated SQLite files.
- Root `.env` loading does not require `apps/web/.env.local`.

## Out Of Scope

- Migrating existing JSON files into SQLite.
- User accounts or multi-user ownership.
- Postgres deployment.
- Search/filter SQL queries beyond the current saved-list behavior.
