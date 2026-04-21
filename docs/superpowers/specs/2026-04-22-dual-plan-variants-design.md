# 双方案生成与切换设计

- 日期：2026-04-22
- 状态：Approved for implementation
- 适用范围：`apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`、`apps/mobile-ios/src/screens/map/MapResultView.tsx`、`apps/mobile-ios/src/screens/map/result-variants.ts`
- 关联文档：
  - `apps/mobile-ios/src/api/client.ts`
  - `apps/trip-api-go/internal/app/server_mainline.go`
  - `apps/mobile-ios/src/utils/itinerary.ts`

## 1. 背景

后端 `generate-v2` 已支持：

1. `variants = 1`
2. `variants = 2`

并在返回体中包含：

1. `plans[].plan_variant`
2. `plans[].itinerary`

当前前端只取 `plans[0]`，因此仍然是单方案体验。

## 2. 目标

本轮目标是在不改后端协议的前提下，让前端支持：

1. 一次生成两个方案
2. 在结果页切换查看 “平衡版 / 体验版”
3. 保存当前正在查看的方案

## 3. 非目标

本轮不做：

1. 多方案同时保存
2. 多方案差异对比页
3. 结果页重新生成局部天数
4. 后端 variant 规则调整

## 4. 方案结论

采用：

`前端 helper 解析 plans[] + 结果页轻量 variant 切换`

## 5. 成功标准

1. `MapFlowScreen` 在生成时请求 `variants = 2`
2. 前端能解析两个方案并保留 label
3. `MapResultView` 能切换显示当前方案
4. 未提供 variants 时仍兼容单方案
