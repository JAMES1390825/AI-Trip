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

Copy `.env.example` to `.env` at the repository root if provider keys are needed.

The app loads provider keys from the root `.env`. Do not create `apps/web/.env.local` for this project.

The MVP works without provider keys by using local fallback data. Configure `AMAP_WEB_SERVICE_KEY` for real POI candidates and walking estimates, AI provider keys for candidate-only AI arrangement, and `SEARCH_PROVIDER=exa` plus `EXA_API_KEY` for public web evidence.

Saved route cards use a local SQLite database by default at `apps/web/.data/route-cards.sqlite`. Set `ROUTE_CARD_DATABASE_FILE` in the root `.env` to use another database file.
