# AI Trip Route Cards

Current mainline: **Node/TypeScript Web full-stack app** for C-end citywalk route cards.

The product helps young users generate a themed route card that is:

- Easy to walk.
- Easy to trust.
- Easy to save.
- Easy to share.

## Active Runtime

- Web app: `apps/web`
- Product docs: `docs/product`

Retired from the current mainline:

- Go backend.
- Native iOS app.
- Community feed.
- Personalization learning system.
- Booking flows.

## Quick Start

```bash
cd apps/web
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
cd apps/web
npm test
npm run typecheck
npm run build
npm run verify
```

## Environment

Copy `.env.example` to `apps/web/.env.local` if provider keys are needed.

The MVP works without provider keys by using local fallback data; real map and AI integrations are optional.

Saved route cards use a local SQLite database by default at `apps/web/.data/route-cards.sqlite`. Set `ROUTE_CARD_DATABASE_FILE` in `apps/web/.env.local` to use another database file.
