# 已保存行程搜索筛选设计

- 日期：2026-04-22
- 状态：Approved for implementation
- 适用范围：`apps/mobile-ios/src/screens/TripsScreen.tsx`、`apps/mobile-ios/src/screens/saved-plan-filters.ts`
- 关联文档：
  - `apps/mobile-ios/src/screens/TripsScreen.tsx`
  - `apps/mobile-ios/src/types/plan.ts`

## 1. 目标

在不改后端 API 的前提下，为已保存行程页增加：

1. 本地搜索
2. 轻量 quick filter
3. 与当前列表兼容的空状态反馈

## 2. 方案

采用：

`前端本地过滤 helper + TripsScreen 搜索框和筛选 chip`

## 3. 成功标准

1. 可按目的地文本搜索
2. 支持至少 3 个 quick filter：全部、即将出发、高可信
3. 搜索/筛选后列表和空状态同步更新
