# trip-api-go

Go backend for the Trip Planner core line (Go backend + iOS app).

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

后端会自动尝试加载这些配置文件：

- 当前目录下的 `.env` / `.env.local`
- 上一级目录下的 `.env` / `.env.local`
- 仓库根目录下的 `.env` / `.env.local`

已经在 shell 中显式导出的环境变量优先级更高。

## Environment

- `PORT` (default: `8080`)
- `JWT_SECRET` (default provided for local dev)
- `JWT_EXPIRATION_MINUTES` (default: `1440`)
- `BOOTSTRAP_CLIENT_SECRET` (default: `dev-bootstrap-secret`)
- `CORS_ALLOWED_ORIGIN_1` (default: `http://localhost:5500`)
- `CORS_ALLOWED_ORIGIN_2` (default: `http://127.0.0.1:5500`)
- `DATA_FILE` (default: `tmp/data/trip-api-go-store.json`)
- `AMAP_API_KEY` (optional but recommended for real POI / route / weather)
- `AMAP_BASE_URL` (default: `https://restapi.amap.com`)
- `AMAP_TIMEOUT_MS` (default: `3500`)
- `AI_SERVICE_BASE_URL` (optional, e.g. `http://127.0.0.1:8091`)
- `AI_SERVICE_API_KEY` / `AI_SERVICE_INTERNAL_TOKEN` / `BAILIAN_API_KEY` (optional token)
- `AI_SERVICE_MODEL_NAME` / `BAILIAN_MODEL_NAME` (optional model override)
- `AI_SERVICE_TIMEOUT_MS` (default: `4000`)

运行 purified backend 前，请先清理旧产品线遗留的本地 store 文件，默认路径是 `tmp/data/trip-api-go-store.json`：

```bash
rm -f tmp/data/trip-api-go-store.json
```

## API Surface

- `GET /api/v1/health`
- `POST /api/v1/auth/token`
- `GET /api/v1/destinations/resolve`
- `POST /api/v1/plans/brief`
- `POST /api/v1/plans/generate-v2`
- `POST /api/v1/plans/validate`
- `POST /api/v1/plans/save`
- `GET /api/v1/plans/saved`
- `GET /api/v1/plans/saved/:id`
- `DELETE /api/v1/plans/saved/:id`
