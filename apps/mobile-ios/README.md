# mobile-ios

iOS 用户端 App（React Native + Expo，先聚焦 iOS）。

当前已完成首版最小闭环：
- 生成行程（`POST /api/v1/plans/generate`）
- 保存行程（`POST /api/v1/plans/save`）
- 地图主视图 + 可拖拽底部行程弹窗

## 启动方式

先启动 AI 服务：

```bash
cd apps/trip-ai-service
export BAILIAN_API_KEY=your-bailian-key
python3 main.py
```

再启动后端：

```bash
export AI_SERVICE_BASE_URL=http://127.0.0.1:8091
cd apps/trip-api-go
go run ./cmd/trip-api-go
```

最后启动 iOS App：

```bash
cd apps/mobile-ios
npm install
npm run ios
```

如需确保地图依赖与 Expo 版本完全匹配，可执行：

```bash
cd apps/mobile-ios
npm exec expo install react-native-maps
```

## 目录说明

- `App.tsx`: 应用入口
- `src/screens/PlannerScreen.tsx`: 输入页 + 地图结果页（含底部弹窗）
- 地图优先结果页支持 `react-native-maps`，未安装时会自动降级到简版地图预览
- `src/api/client.ts`: 与 `trip-api-go` 的 API 封装
- `src/types/plan.ts`: 规划相关类型

## 运行配置

- 手机端不展示运维配置，运行参数通过环境变量注入：
  - `EXPO_PUBLIC_API_BASE`（默认 `http://127.0.0.1:8080`）
  - `EXPO_PUBLIC_BOOTSTRAP_SECRET`（默认 `dev-bootstrap-secret`）
  - `EXPO_PUBLIC_USER_ID`（默认自动生成）
- 可在启动前临时指定，例如：

```bash
EXPO_PUBLIC_API_BASE=http://127.0.0.1:8080 npm run ios
```
