# Trip Assistant P0 API 落地实施清单 v1.1
更新时间：2026-03-21
状态：Ready for Implementation
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)
契约基线：[trip-assistant-p0-api-delta-v1.1.md](./trip-assistant-p0-api-delta-v1.1.md)

---

## 1. 目标与边界

本清单用于把 API 冻结契约 `v1.1` 直接映射到当前代码，形成可执行实现路径。

冻结前提：

- 仅按 `v1.1` 契约实现，不引入 `v1.2` 新字段。
- 不改动现有主链路：`generate/replan/revert/save/saved/versions`。
- 版本链仍保留最近 20 个版本。

---

## 2. 现状差距盘点（基于当前代码）

| 能力 | 现状 | 代码位置 | 差距 |
|---|---|---|---|
| `POST /plans/generate` 多方案 | 仅单方案返回 | `apps/trip-api-go/internal/app/server.go` `handleGeneratePlan` | 需新增 `variants` 分支与统一返回形状 |
| `GET/PUT /plans/saved/{id}/tasks` | 未实现 | `server.go`, `store.go`, `types.go` | 需新增路由、模型、持久化方法 |
| `GET /plans/saved/{id}/diff` | 未实现 | `server.go`, `store.go` | 需新增 diff 计算与参数校验 |
| `POST/DELETE /plans/saved/{id}/share*` | 未实现 | `server.go`, `store.go`, `types.go` | 需新增 token 生命周期与存储索引 |
| `GET /share/{token}` 匿名只读 | 未实现 | `server.go` | 需在鉴权前分流匿名路由 |
| `itinerary.diagnostics` 数据诊断 | 当前无统一输出 | `planner.go`, `server.go` | 需补充后端数据诊断字段 |
| FE 对接 `tasks/diff/share` | 未实现 | `assets/js/core.ts`, `src/pages/*` | 需新增 API 封装与页面入口 |
| FE `/share/:token` 页面 | 未实现 | `src/App.tsx` | 需新增路由与只读页面 |

---

## 3. 后端实施清单（按文件落地）

## 3.1 BE-API-01 路由与鉴权边界

目标：

- 新增以下受鉴权路由：
- `GET/PUT /api/v1/plans/saved/{id}/tasks`
- `GET /api/v1/plans/saved/{id}/diff`
- `POST /api/v1/plans/saved/{id}/share`
- `DELETE /api/v1/plans/saved/{id}/share/{token}`

- 新增以下匿名路由（鉴权前处理）：
- `GET /api/v1/share/{token}`

涉及文件：

- `apps/trip-api-go/internal/app/server.go`

完成标准：

- 路由分发清晰，新增路由不影响既有匹配。
- 匿名分享路由不会被 `/api/v1/**` 统一鉴权拦截。

---

## 3.2 BE-API-02 生成接口扩展（variants）

目标：

- 扩展 `POST /api/v1/plans/generate` 支持 `variants`。
- 行为遵循冻结规则：
- 不传 `variants`：维持旧响应。
- 传 `variants`（1 或 2）：返回 `{ plans, degraded }`。

涉及文件：

- `apps/trip-api-go/internal/app/server.go`
- `apps/trip-api-go/internal/app/planner.go`
- `apps/trip-api-go/internal/app/types.go`

完成标准：

- `variants` 非法值返回 `400 BAD_REQUEST`。
- `plan_variant` 仅 `balanced | experience`。

---

## 3.3 BE-API-03 出发前清单（tasks）

目标：

- 新增 `GET /tasks` 与 `PUT /tasks`。
- `PUT` 语义为全量替换。
- `status` 枚举仅允许 `todo | done | skipped`。

涉及文件：

- `apps/trip-api-go/internal/app/types.go`
- `apps/trip-api-go/internal/app/store.go`
- `apps/trip-api-go/internal/app/server.go`

建议方法：

- `Store.GetPlanTasks(userID, planID) ([]PreTripTask, bool)`
- `Store.ReplacePlanTasks(userID, planID, tasks []PreTripTask) ([]PreTripTask, error)`

完成标准：

- 越权更新返回 `403 FORBIDDEN`。
- 不存在 plan 返回 `404 NOT_FOUND`。
- 更新任务不改变版本链（`versions` 不新增版本）。

---

## 3.4 BE-API-04 版本差异（diff）

目标：

- 新增 `GET /diff?from_version=&to_version=`。
- 参数使用冻结命名：`from_version/to_version`。

涉及文件：

- `apps/trip-api-go/internal/app/server.go`
- `apps/trip-api-go/internal/app/store.go`
- `apps/trip-api-go/internal/app/planner.go`

建议方法：

- `Store.GetPlanVersion(userID, planID, version) (SavedPlanVersion, bool)`
- `BuildItineraryDiff(fromItinerary, toItinerary map[string]any) map[string]any`

完成标准：

- 参数缺失、非正整数、相等版本返回 `400 BAD_REQUEST`。
- `items[]` 满足定位约束：至少 `block_id` 或 `day_index+start_hour+end_hour`。

---

## 3.5 BE-API-05 分享能力（create/close/public-read）

目标：

- 新增：
- `POST /plans/saved/{id}/share`
- `DELETE /plans/saved/{id}/share/{token}`
- `GET /share/{token}`（匿名）

- 响应遵循冻结规则：
- 创建返回 `token + share_path + expires_at`
- 关闭成功 `204`
- token 不存在 `404`

涉及文件：

- `apps/trip-api-go/internal/app/types.go`
- `apps/trip-api-go/internal/app/store.go`
- `apps/trip-api-go/internal/app/server.go`

建议模型：

- `ShareTokenRecord { token, plan_id, user_id, expires_at, closed_at, created_at }`

建议索引：

- `shareByToken map[string]ShareTokenRecord`
- `sharesByPlan map[string][]ShareTokenRecord`

完成标准：

- `expires_in_hours` 范围 `1~720`，默认 `168`。
- 公开读取返回最小脱敏内容，不暴露用户敏感标识。

---

## 3.6 BE-API-06 数据诊断字段（后端侧）

目标：

- 在 itinerary 中补充数据诊断：
- `DEST_COORD_MISMATCH`
- `LONG_TRANSIT_DAY`
- `WINDOW_ALL_LOCKED`

涉及文件：

- `apps/trip-api-go/internal/app/planner.go`
- `apps/trip-api-go/internal/app/server.go`

完成标准：

- 仅返回数据侧诊断，不返回前端本地地图诊断（key/sdk/白名单）。

---

## 3.7 BE-API-07 测试与回归

新增测试建议：

- `apps/trip-api-go/internal/app/server_tasks_test.go`
- `apps/trip-api-go/internal/app/server_diff_test.go`
- `apps/trip-api-go/internal/app/server_share_test.go`
- `apps/trip-api-go/internal/app/store_share_test.go`

必测断言：

- 兼容性：旧 `generate` 响应不变。
- 鉴权边界：`/share/{token}` 匿名可读，其余新增路由需登录。
- 错误格式：`{ error, message, timestamp }`。

---

## 4. 前端对接清单（按页面落地）

## 4.1 FE-API-01 核心 API 封装

目标：

- 在 `assets/js/core.ts` 新增封装：
- `generatePlanVariants(draft, variants)`
- `getPreTripTasks(planId)`
- `replacePreTripTasks(planId, tasks)`
- `getPlanDiff(planId, fromVersion, toVersion)`
- `createPlanShare(planId, expiresInHours)`
- `closePlanShare(planId, token)`
- `getSharedPlan(token)`（匿名，`auth: false`）

完成标准：

- 所有新增方法都复用统一错误处理与 token 流程。

---

## 4.2 FE-API-02 `/plan` 多方案对比

涉及文件：

- `apps/web-client/src/pages/PlanPage.tsx`

目标：

- 生成阶段支持 `variants=2`。
- 展示两套方案对比卡并可设为当前方案。

完成标准：

- 不传 `variants` 的旧流程仍可运行（用于兼容回退）。

---

## 4.3 FE-API-03 `/trip` 清单与差异

涉及文件：

- `apps/web-client/src/pages/TripPage.tsx`

目标：

- 集成 `tasks` 读取/更新。
- 增加版本差异查看（选择 `from_version/to_version`）。

完成标准：

- 清单状态切换后可刷新保留。
- 差异视图支持按天过滤。

---

## 4.4 FE-API-04 `/trips` 分享管理

涉及文件：

- `apps/web-client/src/pages/TripsPage.tsx`

目标：

- 行程卡支持“创建分享链接 / 关闭分享”。
- 展示 `share_path` 并拼接当前域名供复制。

完成标准：

- 关闭后链接访问应显示失效态。

---

## 4.5 FE-API-05 `/share/:token` 只读页

涉及文件：

- `apps/web-client/src/pages/ShareTripPage.tsx`（新增）
- `apps/web-client/src/App.tsx`

目标：

- 新增匿名只读页面，隐藏所有写操作入口。
- 与 `/trip` 视觉上明确区分“只读模式”。

完成标准：

- 未登录可访问。
- 过期或失效 token 展示明确提示与返回入口。

---

## 4.6 FE-API-06 诊断归属对齐

目标：

- `TripPage` 风险卡显示后端 diagnostics。
- 地图诊断继续前端本地计算（key/sdk/白名单）。

涉及文件：

- `apps/web-client/src/pages/TripPage.tsx`

完成标准：

- 两类诊断来源不混用，文案归因清晰。

---

## 5. 联调顺序与门禁

建议联调顺序：

1. `generate(variants)` 返回形状确认
2. `tasks` 读写闭环
3. `diff` 参数与返回项确认
4. `share` 创建/关闭/匿名读取
5. diagnostics 字段与页面展示

门禁要求：

- API 契约快照以 `v1.1` 为准。
- 每完成一个接口，补充对应接口测试。
- 联调期间不改字段名与状态码，若必须改动需先登记变更单。

---

## 6. 变更控制（v1.1 -> v1.2）

为避免联调阶段需求漂移，新增变更控制规则：

- `P0-Blocker`：阻断联调的问题，可进 `v1.1.x` 修订。
- `P0-Enhancement`：体验增强项，统一进入 `v1.2` 候选。
- 任何变更必须同步更新三处文档：
- API 契约文档
- FE/BE 任务清单
- QA 用例矩阵
