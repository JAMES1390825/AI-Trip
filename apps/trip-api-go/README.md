# trip-api-go

Go backend for Trip Planner web client.

## Tech Stack

- Go (standard library only)
- JWT (`HS384`)
- File-backed local store (`tmp/data/trip-api-go-store.json` by default)

## Run

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

Server listens on `http://127.0.0.1:8080` by default.

## Environment

- `PORT` (default: `8080`)
- `JWT_SECRET` (default provided for local dev)
- `JWT_EXPIRATION_MINUTES` (default: `1440`)
- `BOOTSTRAP_CLIENT_SECRET` (default: `dev-bootstrap-secret`)
- `CORS_ALLOWED_ORIGIN_1` (default: `http://localhost:5500`)
- `CORS_ALLOWED_ORIGIN_2` (default: `http://127.0.0.1:5500`)
- `DATA_FILE` (default: `tmp/data/trip-api-go-store.json`)

## API Surface

- `GET /api/v1/health`
- `POST /api/v1/auth/token`
- `POST /api/v1/chat/intake/next`
- `POST /api/v1/plans/generate`
- `POST /api/v1/plans/replan`
- `POST /api/v1/plans/save`
- `GET /api/v1/plans/saved`
- `GET /api/v1/plans/saved/:id`
- `GET /api/v1/plans/saved/:id/summary`
- `DELETE /api/v1/plans/saved/:id`
- `POST /api/v1/events`
- `GET /api/v1/events/summary` (ADMIN)
- `GET /api/v1/events/recent` (ADMIN)
