# web-client

React + Vite + TypeScript 前端（中文体验优先），主链路：
`首页 -> 对话采集 -> 手动生成 -> 行程详情 -> 保存/历史复用`

## 路由页面

- `/`：首页（场景入口 + 最近行程）
- `/plan`：对话采集需求并生成行程
- `/trip`：行程详情 + 局部重规划
- `/trips`：我的行程（历史列表、摘要、删除）
- `/settings`：用户偏好设置
- `/ops`：运维配置（API 地址、Bootstrap Secret、Amap JS Key）

## 运行（命令模式）

先启动后端（终端 A）：

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

再启动前端（终端 B）：

```bash
cd apps/web-client
npm install
npm run dev -- --host 127.0.0.1 --port 5500
```

打开 `http://127.0.0.1:5500`

## 构建与检查

```bash
npm run typecheck
npm run build
npm run preview
```

## 默认后端地址

- API Base: `http://127.0.0.1:8080`
- 如果地址不同，访问 `http://127.0.0.1:5500/ops` 修改

## 说明

- 当前 React 入口：`src/main.tsx`
- 通用工具层已迁移为 `assets/js/core.ts`（当前以 `// @ts-nocheck` 方式平稳过渡）
