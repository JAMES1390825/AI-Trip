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
- Local scripts: `scripts/dev.sh`

Retired from the current mainline:

- Go backend.
- Native iOS app.
- Community feed.
- Personalization learning system.
- Booking flows.

## Quick Start

```bash
bash scripts/dev.sh install
bash scripts/dev.sh dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
bash scripts/dev.sh test
bash scripts/dev.sh typecheck
bash scripts/dev.sh build
bash scripts/dev.sh verify
```

## Environment

Copy `.env.example` to `.env.local` if needed.

The MVP works without provider keys by using local fallback data. Provider and AI integrations are optional future-compatible configuration.
