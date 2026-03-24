# Trip Assistant v1.2 后端任务清单（N1-N4）
更新时间：2026-03-21
负责人建议：Go 后端组
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)
关联 API：[trip-assistant-v1.2-api-delta.md](./trip-assistant-v1.2-api-delta.md)

---

## 1. 范围说明

本清单覆盖 v1.2 P1 后端目标：

- N1 分享地图数据完整性保障
- N2 风险诊断动作化输出
- N3 清单提醒字段兼容扩展
- N4 执行状态持久化接口

原则：

- 完全兼容 v1.1。
- 新增字段可选，旧客户端可忽略。
- 执行状态与版本链解耦。

---

## 2. 任务分解（可直接排期）

| ID | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|
| BE12-01 | 分享只读接口地图字段保障 | `internal/app/server.go`, `internal/app/planner.go` | 无 | 1.5 人日 | `/share/{token}` 返回的 blocks 顺序稳定且点位字段完整可用 |
| BE12-02 | 风险诊断 code/action 扩展 | `internal/app/planner.go`, `internal/app/types.go` | 无 | 2 人日 | 新增 3 类风险 code，含 action 与 target 字段 |
| BE12-03 | 风险动作 payload 兼容返回 | `internal/app/server.go`, `internal/app/types.go` | BE12-02 | 1.5 人日 | replan/task/external_link 动作 payload 可被前端直接消费 |
| BE12-04 | tasks reminder 字段扩展 | `internal/app/types.go`, `internal/app/store.go`, `internal/app/server.go` | 无 | 1.5 人日 | `tasks` 支持 reminder 可选字段，旧数据兼容读取 |
| BE12-05 | execution 状态模型与存储 | `internal/app/types.go`, `internal/app/store.go` | 无 | 2 人日 | 支持 pending/done/skipped 状态，按 plan/date 读写 |
| BE12-06 | execution 接口（GET/PUT） | `internal/app/server.go`, `internal/app/store.go` | BE12-05 | 2 人日 | 新路由鉴权正确，更新不影响 itinerary version |
| BE12-07 | 错误码与权限边界收口 | `internal/app/server.go` | BE12-04~06 | 1 人日 | BAD_REQUEST/NOT_FOUND/FORBIDDEN 行为稳定、文案统一 |
| BE12-08 | 单测与回归补齐 | `internal/app/*_test.go` | 全部 | 2 人日 | `go test ./...` 全通过，覆盖新增接口与兼容场景 |

---

## 3. 数据模型增量

新增/扩展建议：

- `ItineraryDiagnostic.action`（可选）
- `ItineraryDiagnostic.target`（可选）
- `PreTripTask.reminder`（可选）
- `PlanExecutionState`（新增）
- `ExecutionBlockState`（新增）

存储建议：

- `executionByPlanDate map[string]PlanExecutionState`
- 键建议：`{user_id}:{plan_id}:{date}`

---

## 4. Sprint 建议（后端）

### Sprint A（第 1 周）

- BE12-01
- BE12-02
- BE12-03

### Sprint B（第 2 周）

- BE12-04
- BE12-05
- BE12-06

### Sprint C（第 3 周）

- BE12-07
- BE12-08

---

## 5. 联调检查点

| 检查点 | 时间 | 验收内容 |
|---|---|---|
| BE12-L1 | W1 周中 | `/share/{token}` 点位字段与顺序稳定 |
| BE12-L2 | W1 周末 | diagnostics 新 code/action 返回可用 |
| BE12-L3 | W2 周中 | tasks reminder 字段读写兼容 |
| BE12-L4 | W2 周末 | `/execution` 读写闭环可用 |
| BE12-L5 | 发布前 | 新增单测通过，旧接口兼容回归通过 |

---

## 6. 风险与应对

- 风险：execution 状态与回退逻辑耦合导致语义混乱。
- 应对：明确 execution 不进入版本链，独立存储。

- 风险：风险诊断误报影响用户信任。
- 应对：risk level 分级 + action 可忽略 + 文案可解释。

- 风险：tasks reminder 字段引入后旧数据读取异常。
- 应对：默认值兜底与 schema 兼容解析。

---

## 7. 后端验收清单

- 分享只读接口可稳定提供地图点位数据。
- 风险诊断具备 action/target 可执行信息。
- tasks reminder 字段前后兼容。
- execution 状态接口读写稳定且鉴权正确。
- `go test ./...` 全通过，关键回归无破坏。
