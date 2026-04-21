# mobile-ios

iOS 用户端 App（React Native + Expo）。当前只保留“规划 + 已保存行程回看”主线。

## 当前主线

当前 iOS 端围绕这些后端接口工作：

- `/api/v1/destinations/resolve`（GET）
- `/api/v1/plans/brief`（POST）
- `/api/v1/plans/generate-v2`（POST）
- `/api/v1/plans/validate`（POST）
- `/api/v1/plans/save`（POST）
- `/api/v1/plans/saved`（GET）
- `/api/v1/plans/saved/:id`（GET）
- `/api/v1/plans/saved/:id`（DELETE）

不再需要单独启动已退役的本地 AI service。AI 能力已经并入当前 Go backend 的主链。

## 启动方式

先启动 Go backend：

```bash
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

再启动 iOS App：

```bash
cd apps/mobile-ios
npm install
npm run ios
```

也可以在仓库根目录先查看统一入口：

```bash
bash scripts/dev.sh help
bash scripts/dev.sh up-local
```

如需确保地图依赖与 Expo 版本完全匹配，可执行：

```bash
cd apps/mobile-ios
npm exec expo install react-native-maps
```

## 验证

运行 TypeScript 类型检查：

```bash
cd apps/mobile-ios
npm run typecheck
```

如果你在仓库根目录，等价命令是：

```bash
bash scripts/dev.sh ios-typecheck
```

## 目录说明

- `App.tsx`: 两个主 tab 入口（`TripsScreen` + `MapFlowScreen`）
- `src/screens/TripsScreen.tsx`: 已保存行程列表、打开回看、删除行程
- `src/screens/map/MapFlowScreen.tsx`: 规划输入、目的地确认、生成与结果页承接
- `src/api/client.ts`: 与 `trip-api-go` 的 API 封装
- `src/types/plan.ts`: 规划与保存/回看相关类型
- `src/types/itinerary.ts`: 行程与校验结果类型

## 运行配置

运行参数通过环境变量注入：

- `EXPO_PUBLIC_API_BASE`（默认 `http://127.0.0.1:8080`）
- `EXPO_PUBLIC_BOOTSTRAP_SECRET`（默认 `dev-bootstrap-secret`）
- `EXPO_PUBLIC_USER_ID`（默认自动生成）

可在启动前临时指定，例如：

```bash
EXPO_PUBLIC_API_BASE=http://127.0.0.1:8080 npm run ios
```
