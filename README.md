# AI Trip Planner Monorepo

当前仓库主链路为 **Go + React**，默认使用前后端独立命令启动（不依赖 Docker Compose）。

- 后端：`apps/trip-api-go`（Go）
- 前端：`apps/web-client`（React + Vite）

## Repository Structure

- `apps/trip-api-go`: active backend (Go)
- `apps/web-client`: active frontend (React)
- `docs`: product / architecture docs
- `infra/docker`: optional local compose assets

## Quick Start (Command-based)

Start backend in terminal A:

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

Start frontend in terminal B:

```bash
cd apps/web-client
npm install
npm run dev -- --host 127.0.0.1 --port 5500
```

Open:

- Web: `http://127.0.0.1:5500`
- API health: `http://127.0.0.1:8080/api/v1/health`

## Dev Script

```bash
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task up-local
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task backend-dev
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task frontend-dev
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task smoke
```

## Environment Notes

- Bootstrap secret default: `dev-bootstrap-secret`
- Web default API base: `http://127.0.0.1:8080`
- Backend local data file default: `tmp/data/trip-api-go-store.json`

If you use `/ops` page, ensure:

- API Base = `http://127.0.0.1:8080`
- Bootstrap Secret = `dev-bootstrap-secret`
