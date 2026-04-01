# web-client (Admin Console)

React + Vite + TypeScript 后台管理台，仅用于运维配置与联调。

## 页面

- `/`：运维配置页（Admin）

当前页面支持：
- API 地址配置
- Bootstrap Secret 配置
- 调试用户 ID 配置
- Amap JS Key 配置
- 后端健康检查

## 运行（单机）

先启动后端（终端 A）：

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

再启动后台管理台（终端 B）：

```bash
cd apps/web-client
npm install
npm run dev -- --host 127.0.0.1 --port 5500
```

打开：`http://127.0.0.1:5500`

## 构建与检查

```bash
npm run typecheck
npm run build
npm run preview
```

## 说明

- 该应用不再承载用户前台行程规划链路。
- 用户侧产品将迁移到 iOS App。
