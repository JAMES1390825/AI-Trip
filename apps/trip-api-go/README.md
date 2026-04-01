# trip-api-go

Go backend for Trip Planner web client.

## Tech Stack

- Go (standard library only)
- JWT (`HS384`)
- File-backed local store (`tmp/data/trip-api-go-store.json` by default)

## Run

```bash
export AI_SERVICE_BASE_URL=http://127.0.0.1:8091
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
- `COMMUNITY_MEDIA_DIR` (default: `tmp/data/community-media`)
- `AMAP_API_KEY` (optional but recommended for real POI / route / weather)
- `AMAP_BASE_URL` (default: `https://restapi.amap.com`)
- `AMAP_TIMEOUT_MS` (default: `3500`)
- `AI_SERVICE_BASE_URL` (optional, e.g. `http://127.0.0.1:8091`)
- `AI_SERVICE_API_KEY` / `AI_SERVICE_INTERNAL_TOKEN` (optional shared secret)
- `AI_SERVICE_TIMEOUT_MS` (default: `4000`)

社区图片上传当前是本地开发 MVP：

- `POST /api/v1/community/media` 接收认证后的 `multipart/form-data`
- `GET /api/v1/community/media/{filename}` 公开读取图片
- 文件默认落到 `COMMUNITY_MEDIA_DIR`
- 当前未接对象存储、缩略图和异步媒体处理链路

## API Surface

- `GET /api/v1/health`
- `POST /api/v1/auth/token`
- `POST /api/v1/chat/intake/next`
- `GET /api/v1/destinations/resolve`
- `POST /api/v1/plans/brief`
- `POST /api/v1/plans/generate-v2`
- `POST /api/v1/plans/validate`
- `GET /api/v1/places/:provider/:place_id`
- `POST /api/v1/plans/generate`
- `POST /api/v1/plans/replan`
- `POST /api/v1/plans/save`
- `GET /api/v1/plans/saved`
- `GET /api/v1/plans/saved/:id`
- `GET /api/v1/plans/saved/:id/summary`
- `DELETE /api/v1/plans/saved/:id`
- `POST /api/v1/community/media`
- `GET /api/v1/community/media/:filename`
- `POST /api/v1/community/posts`
- `GET /api/v1/community/posts`
- `GET /api/v1/community/posts/:id`
- `POST /api/v1/community/posts/:id/vote`
- `POST /api/v1/community/posts/:id/report`
- `POST /api/v1/events`
- `GET /api/v1/events/summary` (ADMIN)
- `GET /api/v1/events/recent` (ADMIN)
