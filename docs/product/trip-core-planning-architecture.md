# AI Trip Core Planning Architecture

更新时间：2026-04-20  
状态：Current Mainline Architecture

## 运行单元

1. iOS App
2. Go backend

## 请求主链路

1. iOS App 获取认证或设备身份
2. iOS App 调用 `destinations/resolve` 和 `plans/brief`
3. Go backend 组装 brief，判断是否可生成
4. Go backend 调用内部 planning 和 in-process AI 模块生成与解释 itinerary
5. iOS App 展示结果，必要时发起 `plans/validate`
6. 用户发起保存后，由 Go backend 持久化并提供 saved list/detail 回看

## iOS App responsibilities

1. 采集用户输入
2. 展示规划结果、校验结果和保存状态
3. 触发保存与已保存 itinerary 回看
4. 消费 Go backend 提供的唯一当前 API

## Go backend responsibilities

1. Auth/device identity
2. Brief/build/generate/validate/save/review
3. In-process AI module for brief/chat/explain
4. Provider and model orchestration
5. Itinerary validation and degradation semantics
6. Server-side persistence for saved trips and cross-device recovery

## 数据边界

1. 服务端保存的 itinerary 是当前主线真值
2. iOS 本地缓存只作为展示优化，不是恢复真值
3. AI 输出属于后端内部增强层，不独立暴露为单独运行单元

## 非当前范围

1. 社区发布、消费或治理链路
2. 个人化学习与私有信号系统
3. Web 管理或用户体验
4. Python AI service 独立运行时
