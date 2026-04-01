# AI Trip 个人私有信号层开发任务清单（v1）

更新时间：2026-04-02  
状态：Current Delivery Tasklist  
负责人建议：Go 后端组 + iOS 客户端组  
关联 PRD：[trip-user-private-signals-prd-v1.md](./trip-user-private-signals-prd-v1.md)  
关联系统蓝图：[trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)  
关联架构：[trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)

---

## 1. 范围说明

本清单只覆盖“个人私有信号层”v1，不包含：

1. 全局聚合层
2. 社区公开层
3. 跨用户经验回灌
4. 复杂 ML / embedding / 推荐训练

本轮目标链路：

`用户行为事件 -> 用户私有画像 -> 候选排序加权 -> 轻量个性化解释`

---

## 2. 当前基线

当前已具备的基础：

1. 后端已存在 `POST /api/v1/events`
2. Store 已能持久化原始事件
3. 移动端已具备通用 `trackEvent(...)` 能力
4. 当前规划主链路已有候选池、排序、校验和解释基础

当前缺口：

1. 事件尚未沉淀为用户画像
2. 画像尚未接入候选排序
3. 结果页尚未展示“更像你”的轻量解释
4. 尚无个人层专项回归指标

---

## 2.1 本轮已完成

已经完成的个人私有信号层能力：

1. Store 已支持 `ProfilesByUser` 与 `PersonalizationByUser` 持久化。
2. 事件写入后可即时投影 `UserPrivateProfile`。
3. 已提供：
   - `GET /api/v1/profile/private-summary`
   - `PUT /api/v1/profile/private-settings`
   - `DELETE /api/v1/profile/private-signals`
4. 候选池排序已接入 `user_profile_score` 软加权。
5. itinerary 已附带：
   - `personalization_summary`
   - block 级 `personalization_basis`
6. App `行程` Tab 已接入：
   - 私有学习状态卡
   - 暂停 / 恢复学习
   - 清空个人学习记录
7. `MapResultView / PoiDetailSheet` 已展示轻量个性化理由与点位级个性化依据。
8. 已补充个人层接口与生命周期回归测试。

---

## 3. 阶段总览

### Phase P1：事件层打底

目标：

- 关键用户行为可被稳定记录并可消费

### Phase P2：私有画像生成

目标：

- 让系统能从事件生成 `UserPrivateProfile`

### Phase P3：排序与排程接入

目标：

- 让画像开始真实影响当前用户自己的规划结果

### Phase P4：解释与评估

目标：

- 让个性化结果可见、可验证、可持续调优

---

## 4. 后端任务分解（Go）

建议主要涉及文件：

- `apps/trip-api-go/internal/app/types.go`
- `apps/trip-api-go/internal/app/store.go`
- `apps/trip-api-go/internal/app/server.go`
- `apps/trip-api-go/internal/app/planner_provider_candidates.go`
- 新增建议：
- `apps/trip-api-go/internal/app/profile_projector.go`
- `apps/trip-api-go/internal/app/profile_scoring.go`
- `apps/trip-api-go/internal/app/*profile*_test.go`

| ID | 阶段 | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|---|
| UPS-BE-01 | P1 | 冻结个人层事件枚举与 metadata 规范 | `server.go`, `types.go` | 无 | 1 人日 | `plan_saved / block_removed / block_replaced / block_locked / poi_detail_opened / navigation_started / preference_changed` 等事件结构清晰，服务端可稳定接收 |
| UPS-BE-02 | P1 | Store 支持用户私有画像存储与回读 | `store.go`, `types.go` | UPS-BE-01 | 1.5 人日 | `ProfilesByUser` 可持久化，按 `user_id` 强隔离读取 |
| UPS-BE-03 | P2 | 新增事件到画像的投影器 | `profile_projector.go`, `types.go`, `store.go` | UPS-BE-02 | 2 人日 | 写入事件后可生成 `UserPrivateProfile`，包含显式偏好、行为偏好、节奏画像、风险画像与置信度 |
| UPS-BE-04 | P2 | 提供个人画像摘要调试接口 | `server.go` | UPS-BE-03 | 0.5 人日 | `GET /api/v1/profile/private-summary` 可返回当前用户画像摘要，不暴露他人数据 |
| UPS-BE-05 | P3 | 候选排序接入 `user_profile_score` | `planner_provider_candidates.go`, 新增 `profile_scoring.go` | UPS-BE-03 | 2.5 人日 | 当前用户画像可对候选池排序做软加权；冷启动用户完整回退 |
| UPS-BE-06 | P3 | 排程软约束接入节奏与通勤画像 | `planner.go` 或 `planner_provider_candidates.go` | UPS-BE-05 | 2 人日 | `preferred_daily_blocks / max_transit_minutes / rain_avoid_outdoor` 等开始影响排程细节 |
| UPS-BE-07 | P4 | 解释层接入个性化理由 | `ai_service.go` 或 explain 组装逻辑 | UPS-BE-05 | 1.5 人日 | 仅当画像置信度达标时，返回 1~2 条轻量个性化解释 |
| UPS-BE-08 | P4 | 指标与回归样本补齐 | `server.go`, 新增 `profile_*_test.go` | UPS-BE-03~07 | 1.5 人日 | 可观测个性化是否提升保存率、减少删除和替换 |

---

## 5. 客户端任务分解（iOS）

建议主要涉及文件：

- `apps/mobile-ios/src/api/client.ts`
- `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
- `apps/mobile-ios/src/screens/map/MapResultView.tsx`
- `apps/mobile-ios/src/screens/map/PoiDetailSheet.tsx`
- `apps/mobile-ios/src/screens/TripsScreen.tsx`

| ID | 阶段 | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|---|
| UPS-MOB-01 | P1 | 生成成功、保存成功事件接入 | `MapFlowScreen.tsx`, `TripsScreen.tsx` | UPS-BE-01 | 1 人日 | `plan_generated / plan_saved` 能稳定上报 |
| UPS-MOB-02 | P1 | POI 详情打开、开始导航事件接入 | `MapResultView.tsx`, `PoiDetailSheet.tsx` | UPS-BE-01 | 1 人日 | `poi_detail_opened / navigation_started` 具备标准 metadata |
| UPS-MOB-03 | P1 | 删除、替换、锁定行为事件接入 | `MapResultView.tsx`, 深编辑入口 | UPS-BE-01 | 1.5 人日 | `block_removed / block_replaced / block_locked` 可以结构化上报 |
| UPS-MOB-04 | P2 | 偏好修改事件接入 | `PlanEntryView.tsx`, `MapFlowScreen.tsx` | UPS-BE-01 | 1 人日 | `preference_changed` 带预算、节奏、风格等 metadata |
| UPS-MOB-05 | P4 | 结果页展示轻量个性化解释 | `MapResultView.tsx`, `PoiDetailSheet.tsx` | UPS-BE-07 | 1 人日 | 仅在有足够置信度时展示“更像你”的个性化文案 |

---

## 6. 验证任务

| ID | 阶段 | 任务 | 依赖 | 完成标准（DoD） |
|---|---|---|---|---|
| UPS-QA-01 | P2 | 画像生成单测 | UPS-BE-03 | 对“删商场、保留江景、雨天友好”样本能稳定得到合理画像 |
| UPS-QA-02 | P3 | 冷启动回退验证 | UPS-BE-05 | 无历史事件用户结果不应明显偏离当前版本 |
| UPS-QA-03 | P3 | 私有隔离验证 | UPS-BE-05 | User A 行为不会影响 User B 画像和结果 |
| UPS-QA-04 | P4 | 个性化收益验证 | UPS-BE-07, UPS-MOB-05 | 保存率、删除率、替换率至少有一组可比较实验指标 |

---

## 7. 当前推荐落地顺序

建议按下面顺序推进，不要倒序：

1. `UPS-BE-01 ~ UPS-BE-04`
2. `UPS-MOB-01 ~ UPS-MOB-04`
3. `UPS-BE-05 ~ UPS-BE-06`
4. `UPS-BE-07 + UPS-MOB-05`
5. `UPS-QA-01 ~ UPS-QA-04`

理由：

1. 没有事件和画像，后面的排序接入都是空谈。
2. 没有冷启动回退和私有隔离，个性化容易伤主链路。
3. 先做排序收益，再做解释展示，能避免“解释有了但实际没变好”。

---

## 8. 当前回合已启动项

本轮已实装并建议下一步继续的任务：

1. `UPS-BE-02 ~ UPS-BE-07`
2. `UPS-MOB-01 ~ UPS-MOB-05`
3. `UPS-QA-01`

仍待深化的主要部分：

1. `UPS-BE-08` 指标与实验收口
2. `UPS-QA-02 ~ UPS-QA-04` 冷启动、隔离与收益验证
