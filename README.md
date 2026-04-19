# AI Trip Planner Monorepo

当前仓库主链路为 **Go + iOS App + Admin Web + 独立 AI Service**，默认使用独立命令启动（单机部署）。

- 后端：`apps/trip-api-go`（Go）
- AI 服务：`apps/trip-ai-service`（Python，兼容阿里百炼）
- 后台：`apps/web-client`（React + Vite Admin Console）
- 用户端：`apps/mobile-ios`（React Native + Expo，iOS）

## Repository Structure

- `apps/trip-api-go`: active backend (Go)
- `apps/trip-ai-service`: isolated AI service (Python)
- `apps/web-client`: admin console (React)
- `apps/mobile-ios`: iOS app workspace (Expo)
- `docs`: product / architecture docs
- `infra/monitoring`: optional local monitoring configs (paused by default in single-machine mode)

## Documentation

- Docs index: [`docs/README.md`](docs/README.md)
- Product docs map: [`docs/product/README.md`](docs/product/README.md)
- Current system blueprint: [`docs/product/trip-system-signals-and-learning-architecture-v1.md`](docs/product/trip-system-signals-and-learning-architecture-v1.md)
- Personal & community PRD: [`docs/product/trip-personal-and-community-prd-v1.md`](docs/product/trip-personal-and-community-prd-v1.md)
- Personal signals PRD: [`docs/product/trip-user-private-signals-prd-v1.md`](docs/product/trip-user-private-signals-prd-v1.md)
- Personal signals tasklist: [`docs/product/trip-user-private-signals-tasklist-v1.md`](docs/product/trip-user-private-signals-tasklist-v1.md)
- Community tasklist: [`docs/product/trip-community-tasklist-v1.md`](docs/product/trip-community-tasklist-v1.md)
- Community governance PRD: [`docs/product/trip-community-governance-prd-v1.md`](docs/product/trip-community-governance-prd-v1.md)
- Current planning architecture: [`docs/product/trip-mobile-real-data-architecture-v1.md`](docs/product/trip-mobile-real-data-architecture-v1.md)
- Current API contract: [`docs/product/trip-mobile-real-data-api-contract-v1.md`](docs/product/trip-mobile-real-data-api-contract-v1.md)

## Prerequisites

- Go 1.22+ (`go version`)
- Python 3.11+ (`python3 --version`)
- Node.js 20+ and npm (`node -v`, `npm -v`)
- curl (for smoke checks)

## Quick Start (Single-machine)

先准备环境变量：

```bash
cp .env.example .env
```

至少补齐这三项：

- `BAILIAN_API_KEY`
- `AI_SERVICE_API_KEY`
- `AMAP_API_KEY` ；不填时会自动回退到内置地点、估算路线和非实时天气

Start AI service in terminal A:

```bash
cd apps/trip-ai-service
python3 main.py
```

Start backend in terminal B:

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

Start admin console in terminal C:

```bash
cd apps/web-client
npm install
npm run dev -- --host 127.0.0.1 --port 5500
```

Open:

- Admin Web: `http://127.0.0.1:5500`
- API health: `http://127.0.0.1:8080/api/v1/health`

Start iOS app in terminal D:

```bash
cd apps/mobile-ios
npm install
npm run ios
```

当前移动端已经接入：

- `行程` Tab：已保存行程、社区分享发布、社区精选浏览
- `AI规划` Tab：目的地社区灵感选择，并通过 `community_post_ids` 反哺 `generate-v2`
- 社区帖子详情、作者公开资料、我的公开分享回看
- 私有学习状态卡、暂停 / 恢复学习、清空个人学习记录
- 结果页可见社区参考说明与个性化说明

当前社区图片已经支持：

- iOS 相册选择
- `POST /api/v1/community/media` 本地上传
- 发帖表单自动回填图片 URL

当前仍然是本地开发 MVP：

- 图片保存到 `COMMUNITY_MEDIA_DIR` 指向的本地目录
- 暂未接对象存储、缩略图和异步媒体处理链路
- 公开图片地址由 Go 后端直接托管，例如 `/api/v1/community/media/{filename}`

## Dev Script

macOS / Linux:

```bash
bash scripts/dev.sh up-local
bash scripts/dev.sh backend-dev
bash scripts/dev.sh frontend-dev
bash scripts/dev.sh smoke
```

Windows (PowerShell):

```bash
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task up-local
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task backend-dev
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task frontend-dev
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Task smoke
```

Cross-platform e2e smoke:

```bash
bash scripts/smoke/run-local-e2e.sh
# Windows:
powershell -ExecutionPolicy Bypass -File scripts/smoke/run-local-e2e.ps1
```

The smoke flow validates the backend mainline path:

`auth/token -> destinations/resolve -> plans/brief -> plans/generate-v2 -> plans/validate -> plans/save -> events`

## Environment Notes

可以先执行：

```bash
cp .env.example .env
```

- Bootstrap secret default: `dev-bootstrap-secret`
- Web default API base: `http://127.0.0.1:8080`
- Backend local data file default: `tmp/data/trip-api-go-store.json`
- Community media dir default: `tmp/data/community-media`
- AI service default URL: `http://127.0.0.1:8091`
- Real provider / route / weather default source: `AMAP_API_KEY`
- `.env` / `.env.local` 会被 Go 后端和 Python AI service 自动加载

If you use admin page (`/`), ensure:

- API Base = `http://127.0.0.1:8080`
- Bootstrap Secret = `dev-bootstrap-secret`
