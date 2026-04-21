# AI Trip Planner Monorepo

当前仓库主线只保留 **Go 后端 + iOS App**，围绕“规划生成、校验、保存、回看”闭环。

- 后端：`apps/trip-api-go`
- 用户端：`apps/mobile-ios`
- 文档：`docs`

当前不再保留：

- 独立 AI Service 运行时
- Admin Web
- 社区
- 个人化学习
- Windows 开发脚本

## Repository Structure

- `apps/trip-api-go`: current backend runtime and server-side save/review truth
- `apps/mobile-ios`: current iOS client workspace
- `docs`: current product, architecture, API, and tasklist docs
- `scripts`: local startup and verification entry scripts

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
- curl (`curl --version`)

## Recommended Commands

优先使用统一入口脚本：

```bash
bash scripts/dev.sh help
bash scripts/dev.sh up-local
bash scripts/dev.sh verify-fast
bash scripts/dev.sh smoke
bash scripts/dev.sh verify
```

## Verification

### Fast Verification

适合日常改动后的低成本回归：

```bash
bash scripts/dev.sh backend-test
bash scripts/dev.sh ios-typecheck
bash scripts/dev.sh verify-fast
```

`verify-fast` 只覆盖 Go backend tests 和 iOS typecheck，不启动服务，也不写本地 store。

### Full Mainline Smoke

适合准备交付前检查当前主链：

```bash
bash scripts/dev.sh smoke
bash scripts/dev.sh verify
```

`smoke` 会启动本地 `trip-api-go`，串行验证：

1. `auth/token`
2. `destinations/resolve`
3. `plans/brief`
4. `plans/generate-v2`
5. `plans/validate`
6. `plans/save`
7. `plans/saved` list/detail
8. `DELETE /plans/saved/:id`

## Quick Start

打印推荐启动方式：

```bash
bash scripts/dev.sh up-local
```

手动启动后端：

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

手动启动 iOS App：

```bash
cd apps/mobile-ios
npm install
npm run ios
```

检查后端健康：

```bash
curl http://127.0.0.1:8080/api/v1/health
```

## Environment Notes

Go backend 会自动加载工作目录向上的 `.env` / `.env.local`。

常用环境变量：

- `BOOTSTRAP_CLIENT_SECRET`
- `AMAP_API_KEY`
- `AI_SERVICE_BASE_URL`
- `BAILIAN_API_KEY`
- `AI_SERVICE_MODEL_NAME`

说明：

- `AMAP_API_KEY` 为空时，后端会回退到内置候选与降级路径
- AI_SERVICE_BASE_URL 是可选的上游 AI 兼容接口地址，不代表需要单独启动本地 AI service
- LLM 配置为空时，brief/chat/explain 会回退到 Go 内部默认语义
