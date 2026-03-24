# Trip Assistant P0 后端任务清单
更新时间：2026-03-21
负责人建议：Go 后端组
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)

---

## 1. 范围说明

本清单覆盖 P0 后端核心改造：

- 生成多方案
- 出发前清单存储
- 版本差异接口
- 只读分享能力
- 诊断能力
- 埋点口径补齐

保持原则：

- 与现有 `generate/replan/revert/versions` 保持兼容。
- 单行程版本仍保留最近 20 个。
- 不引入外部重型依赖，优先本地规则能力。

---

## 2. 任务分解（可直接排期）

| ID | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|
| BE-01 | 多方案生成能力（2 套） | `internal/app/server.go`, `internal/app/planner.go`, `internal/app/types.go` | API-01 | 2 人日 | 支持返回 `balanced/experience` 两套方案，兼容单方案调用 |
| BE-02 | 出发前清单模型与持久化 | `internal/app/types.go`, `internal/app/store.go`, `internal/app/server.go` | API-02 | 2 人日 | 新增 tasks 读写接口，状态持久化且不影响版本链 |
| BE-03 | 版本差异计算接口 | `internal/app/server.go`, `internal/app/store.go`, `internal/app/planner.go` | API-03 | 2.5 人日 | 支持 `from_version/to_version` 差异返回，包含 day/block 粒度 |
| BE-04 | 分享 token 与只读访问 | `internal/app/types.go`, `internal/app/store.go`, `internal/app/server.go` | API-04 | 2.5 人日 | 支持创建/关闭分享，匿名只读访问分享内容 |
| BE-05 | 地图与风险诊断生成 | `internal/app/planner.go`, `internal/app/server.go` | API-05 | 1.5 人日 | 返回 diagnostics 字段，覆盖 key场景与目的地坐标一致性 |
| BE-06 | 埋点字段标准化 | `internal/app/server.go`, `internal/app/store.go` | API-06 | 1 人日 | 关键事件字段补齐，满足指标口径 |
| BE-07 | 回归与兼容收口 | `internal/app/*_test.go` | FE 联调 | 1.5 人日 | 全量 `go test ./...` 通过，旧接口兼容通过 |

---

## 3. 数据模型增量建议

新增（建议）结构：

- `PreTripTask`
- `PlanVariant`
- `PlanDiagnostics`
- `ShareTokenRecord`

建议落位：

- `SavedPlan.Itinerary` 内扩展字段：
- `plan_variant`
- `pre_trip_tasks`
- `diagnostics`

单独索引存储：

- `share_by_token`
- `share_by_plan`

---

## 4. Sprint 建议（后端）

### Sprint 1（第 1 周）

- BE-01 多方案生成
- BE-02 清单存储

### Sprint 2（第 2 周）

- BE-03 版本差异接口
- BE-05 风险诊断能力

### Sprint 3（第 3 周）

- BE-04 分享只读
- BE-06 埋点标准化
- BE-07 回归收口

---

## 5. 联调检查点

| 检查点 | 时间 | 验收内容 |
|---|---|---|
| BE-L1 | 周中（W1） | 生成可返回 2 套方案；清单可读写 |
| BE-L2 | 周中（W2） | 版本差异接口可被前端消费；诊断字段稳定返回 |
| BE-L3 | 周中（W3） | 分享创建/关闭/只读访问链路可用 |
| BE-L4 | 发布前 | 兼容回归与性能指标达标 |

---

## 6. 风险与应对

- 风险：多方案生成带来延迟上升。
- 应对：限制为 2 套，超时降级单套并返回 `degraded=true`。

- 风险：分享 token 泄露造成越权访问。
- 应对：高熵随机 token + 可手动失效 + 最小暴露字段。

- 风险：差异计算逻辑复杂，易出现误差。
- 应对：以 `block_id` 为主键做 diff，对无 `block_id` 做兼容回退。

---

## 7. 后端验收清单

- 生成接口支持多方案，保持旧客户端兼容。
- 任务清单接口可用且稳定持久化。
- 版本差异接口输出可前端直用。
- 分享 token 生命周期完整（创建/读取/关闭）。
- 诊断字段在典型异常场景可返回。
- 埋点事件口径满足 Step 2 指标要求。
- 全量单测通过，关键性能阈值达标。

