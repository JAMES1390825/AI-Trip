# AI Trip Planner Monorepo

当前仓库主链路为 **Go 后端 + iOS App**。

- 后端：`apps/trip-api-go`
- 用户端：`apps/mobile-ios`

当前不再保留：

- 独立 AI Service
- Admin Web
- 社区
- 个人化学习
- Windows 开发脚本

## Repository Structure

- `apps/trip-api-go`: current backend runtime and server-side save/review truth
- `apps/mobile-ios`: current iOS client workspace
- `docs`: current product, architecture, API, and tasklist docs

## Documentation

- Docs index: [`docs/README.md`](docs/README.md)
- ADR: [`docs/adr/ADR-001-tech-stack-and-boundaries.md`](docs/adr/ADR-001-tech-stack-and-boundaries.md)
- Product docs map: [`docs/product/README.md`](docs/product/README.md)
- PRD: [`docs/product/trip-core-planning-prd.md`](docs/product/trip-core-planning-prd.md)
- Architecture: [`docs/product/trip-core-planning-architecture.md`](docs/product/trip-core-planning-architecture.md)
- API: [`docs/product/trip-core-planning-api.md`](docs/product/trip-core-planning-api.md)
- Tasklist: [`docs/product/trip-core-planning-tasklist.md`](docs/product/trip-core-planning-tasklist.md)

## Prerequisites

- Go 1.22+ (`go version`)
- Node.js 20+ and npm (`node -v`, `npm -v`)
- curl (for smoke checks)

## Environment Notes

Go backend 会自动加载仓库根目录附近的 `.env` / `.env.local`。

常用环境变量：

- `BOOTSTRAP_CLIENT_SECRET`
- `AMAP_API_KEY`
- `BAILIAN_API_KEY`
- `AI_SERVICE_BASE_URL`
- `AI_SERVICE_MODEL_NAME`

说明：

- `AMAP_API_KEY` 为空时，后端会回退到内置候选与降级路径
- LLM 配置为空时，brief/chat/explain 会回退到 Go 内部默认语义

## Quick Start

启动后端：

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

启动 iOS App：

```bash
cd apps/mobile-ios
npm install
npm run ios
```

检查后端健康：

```bash
curl http://127.0.0.1:8080/api/v1/health
```

运行本地 smoke：

```bash
bash scripts/smoke/run-local-e2e.sh --user-id smoke-user --destination 上海
```

## Dev Script

macOS / Linux:

```bash
bash scripts/dev.sh up-local
bash scripts/dev.sh backend-dev
bash scripts/dev.sh app-dev
bash scripts/dev.sh smoke
```
