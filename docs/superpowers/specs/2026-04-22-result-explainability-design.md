# 结果页可信度与校验解释设计

- 日期：2026-04-22
- 状态：Approved for implementation
- 适用范围：`apps/mobile-ios/src/screens/map/MapResultView.tsx`、`apps/mobile-ios/src/screens/map/result-explainability.ts`、`apps/mobile-ios/package.json`、`apps/mobile-ios/tsconfig.test.json`
- 关联文档：
  - `apps/mobile-ios/src/screens/map/MapResultView.tsx`
  - `apps/mobile-ios/src/types/itinerary.ts`
  - `apps/mobile-ios/src/utils/itinerary.ts`

## 1. 背景

当前结果页已经能展示：

1. 地图与路线
2. 今天建议
3. 行程摘要
4. warning / diagnostics

同时，前端解析层也已经拿到了这些解释性数据：

1. `confidence`
2. `degraded`
3. `degradedReason`
4. `validationResult`
5. `sourceMode`

但这些信息还没有被整理成用户可读的“这份行程靠不靠谱”说明，导致：

1. 用户只知道结果生成出来了，不知道可信度高低
2. 降级原因被埋在 warning 文案里
3. 校验通过与否没有变成明确状态

## 2. 目标

本轮目标是在不改后端接口的前提下，把结果页补成一个“可解释结果页”。

具体目标：

1. 展示 itinerary 可信度百分比
2. 展示校验状态和 confidence tier
3. 在降级时明确展示降级原因
4. 用简洁指标展示校验覆盖度
5. 让这段解释逻辑拥有纯函数测试

## 3. 非目标

本轮不做：

1. 新增后端字段
2. 修改保存逻辑
3. 新增详情解释页
4. 改地图或路线交互
5. 双方案生成

## 4. 方案结论

采用：

`纯 helper 解释模型 + 轻量解释卡 UI`

即：

1. 把结果解释规则抽成纯函数
2. `MapResultView` 只负责渲染解释卡
3. warning 卡保留，但不再承担“唯一解释入口”

## 5. UI 设计

在现有 summary card 和 warning card 之间新增一张“可信度与校验”卡。

这张卡至少展示：

1. 可信度百分比
2. 校验状态
3. confidence tier
4. 数据来源标签
5. 降级说明
6. 最多 4 个覆盖指标

覆盖指标优先展示：

1. provider grounded blocks
2. route evidence coverage
3. weather evidence coverage
4. must-go hit rate

## 6. 结构设计

新增纯逻辑模块：

`apps/mobile-ios/src/screens/map/result-explainability.ts`

负责把 `ItineraryView` 转成结果页解释模型，例如：

1. confidence 文案
2. validation badge
3. degraded message
4. coverage item 列表
5. issue preview 列表

## 7. 测试设计

本轮继续复用 `mobile-ios` 已有的轻量测试入口。

测试覆盖这些场景：

1. 有 validation 且通过
2. 有 validation 但未通过
3. 降级原因存在
4. 没有 validation 时的兜底状态
5. coverage 百分比格式化

## 8. 成功标准

本轮完成后，应满足：

1. 用户进入结果页后，能一眼看到可信度和校验状态
2. 降级原因不再埋在 warning 文案里
3. 解释逻辑不直接写死在 `MapResultView`
4. 新 helper 有自动化测试
